// backend/tests/memory_auditor.test.js
//
// Memory Auditor: SQL guard, home isolation, and MCP config
// failures. Live Cockroach Cloud MCP is not required.

import request from "supertest";

import {
    beforeAll,
    beforeEach,
    afterEach,
    describe,
    expect,
    test,
    vi,
} from "vitest";

import {
    fillMcpToolArgs,
} from "../services/mcp/cockroachMcp.js";

import {
    assertSelectQueryAllowed,
    assertToolCallAllowed,
} from "../services/mcp/sqlGuard.js";


const USER_A_ID =
    "auth0|memory-auditor-user-a";

const USER_B_ID =
    "auth0|memory-auditor-user-b";

const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";

const AUDIT_RUN_ID =
    "99999999-9999-4999-8999-999999999999";


const {
    mockPoolQuery,
    mockRunMemoryAuditor,
} = vi.hoisted(() => {
    return {
        mockPoolQuery: vi.fn(),
        mockRunMemoryAuditor: vi.fn(),
    };
});


vi.mock("../middleware/auth.js", () => {
    return {
        requireAuth: (req, res, next) => {
            const testUserId =
                req.header("x-test-user-id");

            if (!testUserId) {
                return res.status(401).json({
                    error: "Authentication required",
                });
            }

            req.auth = {
                payload: { sub: testUserId },
            };

            return next();
        },

        getAuthenticatedUserId: (req) => {
            const userId = req.auth?.payload?.sub;

            if (!userId) {
                throw new Error(
                    "Authenticated token is missing a subject"
                );
            }

            return userId;
        },
    };
});


vi.mock("../db/pool.js", () => {
    return {
        pool: {
            query: mockPoolQuery,
            connect: vi.fn(),
        },
    };
});


vi.mock("../services/s3.js", () => {
    return {
        createDocumentDownloadUrl: vi.fn(),
        deleteDocumentFromS3: vi.fn(),
        uploadDocumentToS3: vi.fn(),
    };
});


vi.mock("../services/ai/index.js", () => {
    return {
        createEmbedding: vi.fn(),
        vectorToSql: vi.fn(),
        generateHouseAgentResponse: vi.fn(),
        analyzeHomeDocument: vi.fn(),
    };
});


vi.mock("../services/ai/memoryAuditor.js", () => {
    return {
        runMemoryAuditor: mockRunMemoryAuditor,
        DEFAULT_AUDITOR_QUESTION:
            "Show me everything HouseIQ currently knows about the HVAC system and where that knowledge came from.",
    };
});


function normalizeSql(sql) {
    return String(sql)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


let app;
let originalMcpApiKey;
let originalMcpClusterId;

beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH0_DOMAIN =
        "test-houseiq.us.auth0.com";
    process.env.AUTH0_AUDIENCE =
        "https://api.houseiq.app";

    const serverModule = await import("../server.js");
    app = serverModule.app;
});


describe("Memory Auditor SQL guard", () => {
    const homeId = USER_A_HOME_ID;

    test("allows a home-scoped SELECT", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id, name FROM home_assets WHERE home_id = '${homeId}' LIMIT 25`,
                homeId
            )
        ).not.toThrow();
    });

    test("rejects SELECT that is not scoped to the home", () => {
        expect(() =>
            assertSelectQueryAllowed(
                "SELECT id, name FROM home_assets LIMIT 25",
                homeId
            )
        ).toThrow(/home_id/);
    });

    test("rejects SELECT scoped to a different home", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE home_id = '${USER_B_HOME_ID}'`,
                homeId
            )
        ).toThrow(/home_id/);
    });

    test("rejects write SQL", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `INSERT INTO memories (home_id) VALUES ('${homeId}')`,
                homeId
            )
        ).toThrow(/SELECT/);
    });

    test("rejects multiple statements", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE home_id = '${homeId}'; SELECT id FROM homes`,
                homeId
            )
        ).toThrow(/Multiple/);
    });

    test("blocks write MCP tools", () => {
        expect(() =>
            assertToolCallAllowed({
                toolName: "insert_rows",
                args: {},
                homeId,
            })
        ).toThrow(/not allowed/);
    });

    test("allows schema inspection without a home filter", () => {
        expect(() =>
            assertToolCallAllowed({
                toolName: "list_tables",
                args: { database: "houseiq" },
                homeId,
            })
        ).not.toThrow();
    });

    test("pins MCP calls to the HouseIQ cluster and database", () => {
        const filled = fillMcpToolArgs(
            "select_query",
            {
                query: "SELECT 1",
                cluster_id: "should-be-removed",
            },
            {
                clusterId: "cluster-1",
                database: "houseiq",
            }
        );

        expect(filled.cluster_id).toBeUndefined();
        expect(filled.database).toBe("houseiq");
        expect(filled.query).toBe("SELECT 1");
    });

    test("overwrites a caller-supplied database", () => {
        const filled = fillMcpToolArgs(
            "select_query",
            {
                query: "SELECT 1",
                database: "defaultdb",
            },
            {
                clusterId: "cluster-1",
                database: "houseiq",
            }
        );

        expect(filled.database).toBe("houseiq");
    });

    test("rejects UNION that scopes only the first SELECT", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE home_id = '${homeId}' UNION SELECT id FROM memories`,
                homeId
            )
        ).toThrow(/UNION/);
    });

    test("rejects CTE / WITH queries", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `WITH x AS (SELECT id FROM memories WHERE home_id = '${homeId}') SELECT * FROM x`,
                homeId
            )
        ).toThrow(/WITH/);
    });

    test("rejects an unscoped subquery", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE home_id = '${homeId}' AND id IN (SELECT id FROM memories)`,
                homeId
            )
        ).toThrow(/Subqueries|SELECT/);
    });

    test("rejects SQL comments used to obfuscate extra statements", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE home_id = '${homeId}'; /* ; */ SELECT id FROM homes`,
                homeId
            )
        ).toThrow(/Multiple|SELECT/);
    });

    test("still requires home_id after comment stripping", () => {
        expect(() =>
            assertSelectQueryAllowed(
                `SELECT id FROM memories WHERE /* home_id = '${homeId}' */ id IS NOT NULL`,
                homeId
            )
        ).toThrow(/home_id/);
    });
});


describe("POST /api/homes/:homeId/memory-audit", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        originalMcpApiKey =
            process.env.COCKROACH_MCP_API_KEY;
        originalMcpClusterId =
            process.env.COCKROACH_CLUSTER_ID;

        delete process.env.COCKROACH_MCP_API_KEY;
        delete process.env.COCKROACH_CLUSTER_ID;

        mockRunMemoryAuditor.mockResolvedValue({
            answer:
                "HouseIQ knows the furnace from the HVAC invoice.",
            toolTrace: [
                {
                    tool: "select_query",
                    arguments: {
                        query:
                            `SELECT name FROM home_assets WHERE home_id = '${USER_A_HOME_ID}' LIMIT 25`,
                    },
                    rowCount: 1,
                    preview: '[{"name":"Furnace"}]',
                    elapsedMs: 12,
                    isError: false,
                },
            ],
            model: "gpt-4o-mini",
            durationMs: 40,
        });

        mockPoolQuery.mockImplementation(
            async (sql, parameters = []) => {
                const normalizedSql = normalizeSql(sql);

                if (
                    normalizedSql.includes(
                        "from home_members"
                    )
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalizedSql.includes(
                        "select id, owner_auth0_id from homes"
                    )
                ) {
                    const [homeId, ownerAuth0Id] =
                        parameters;

                    if (
                        homeId === USER_A_HOME_ID &&
                        ownerAuth0Id === USER_A_ID
                    ) {
                        return {
                            rows: [
                                {
                                    id: USER_A_HOME_ID,
                                    owner_auth0_id:
                                        USER_A_ID,
                                },
                            ],
                            rowCount: 1,
                        };
                    }

                    if (
                        homeId === USER_B_HOME_ID &&
                        ownerAuth0Id === USER_B_ID
                    ) {
                        return {
                            rows: [
                                {
                                    id: USER_B_HOME_ID,
                                    owner_auth0_id:
                                        USER_B_ID,
                                },
                            ],
                            rowCount: 1,
                        };
                    }

                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalizedSql.includes(
                        "insert into home_members"
                    )
                ) {
                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalizedSql.includes(
                        "select id, name from homes"
                    )
                ) {
                    const [homeId] = parameters;

                    if (homeId === USER_A_HOME_ID) {
                        return {
                            rows: [
                                {
                                    id: USER_A_HOME_ID,
                                    name: "User A House",
                                },
                            ],
                            rowCount: 1,
                        };
                    }

                    return { rows: [], rowCount: 0 };
                }

                if (
                    normalizedSql.includes(
                        "insert into agent_runs"
                    )
                ) {
                    return {
                        rows: [
                            {
                                id: AUDIT_RUN_ID,
                                home_id: parameters[0],
                                user_question:
                                    parameters[1],
                                answer: parameters[2],
                                status: parameters[3],
                                run_kind: parameters[9],
                            },
                        ],
                        rowCount: 1,
                    };
                }

                throw new Error(
                    `Unrecognized SQL in memory auditor test:\n${normalizedSql}`
                );
            }
        );
    });

    afterEach(() => {
        if (originalMcpApiKey === undefined) {
            delete process.env.COCKROACH_MCP_API_KEY;
        } else {
            process.env.COCKROACH_MCP_API_KEY =
                originalMcpApiKey;
        }

        if (originalMcpClusterId === undefined) {
            delete process.env.COCKROACH_CLUSTER_ID;
        } else {
            process.env.COCKROACH_CLUSTER_ID =
                originalMcpClusterId;
        }
    });

    test("a user who does not own the home receives 404 and MCP is never called", async () => {
        const response = await request(app)
            .post(
                `/api/homes/${USER_A_HOME_ID}/memory-audit`
            )
            .set("x-test-user-id", USER_B_ID)
            .send({
                question:
                    "What does HouseIQ know about the HVAC system?",
            });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: "Home not found",
        });
        expect(mockRunMemoryAuditor).not.toHaveBeenCalled();
    });

    test("returns 503 when Cockroach MCP env is missing", async () => {
        const response = await request(app)
            .post(
                `/api/homes/${USER_A_HOME_ID}/memory-audit`
            )
            .set("x-test-user-id", USER_A_ID)
            .send({
                question:
                    "What does HouseIQ know about the HVAC system?",
            });

        expect(response.status).toBe(503);
        expect(response.body.error).toMatch(/MCP/i);
        expect(mockRunMemoryAuditor).not.toHaveBeenCalled();
    });

    test("returns the MCP tool trace for an authorized home", async () => {
        process.env.COCKROACH_MCP_API_KEY = "test-mcp-key";
        process.env.COCKROACH_CLUSTER_ID = "test-cluster";

        const response = await request(app)
            .post(
                `/api/homes/${USER_A_HOME_ID}/memory-audit`
            )
            .set("x-test-user-id", USER_A_ID)
            .send({
                question:
                    "Show me everything HouseIQ currently knows about the HVAC system and where that knowledge came from.",
            });

        expect(response.status).toBe(200);
        expect(response.body.via).toBe(
            "cockroachdb-cloud-mcp"
        );
        expect(response.body.answer).toMatch(/furnace/i);
        expect(response.body.toolTrace).toHaveLength(1);
        expect(response.body.toolTrace[0].tool).toBe(
            "select_query"
        );
        expect(mockRunMemoryAuditor).toHaveBeenCalledTimes(
            1
        );
        expect(mockRunMemoryAuditor).toHaveBeenCalledWith(
            expect.objectContaining({
                homeId: USER_A_HOME_ID,
                homeName: "User A House",
            })
        );
    });
});
