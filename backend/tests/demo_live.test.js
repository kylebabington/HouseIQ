// backend/tests/demo_live.test.js
//
// Public judge live Vector + MCP endpoints. Questions are
// hardcoded server-side. Auth is not required.

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
    JUDGE_ASK_QUESTION,
    JUDGE_AUDIT_QUESTION,
} from "../lib/judgeDemo.js";

const DEMO_HOME_ID =
    "f0185f3c-6231-4e10-8a59-dcb04695e49f";

const {
    mockPoolQuery,
    mockRunReadOnlyAsk,
    mockRunMemoryAuditor,
} = vi.hoisted(() => {
    return {
        mockPoolQuery: vi.fn(),
        mockRunReadOnlyAsk: vi.fn(),
        mockRunMemoryAuditor: vi.fn(),
    };
});

vi.mock("../middleware/auth.js", () => {
    return {
        requireAuth: (req, res, next) => next(),
        getAuthenticatedUserId: () => "auth0|unused",
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

vi.mock("../services/ai/runReadOnlyAsk.js", () => {
    return {
        runReadOnlyAsk: mockRunReadOnlyAsk,
    };
});

vi.mock("../services/ai/memoryAuditor.js", () => {
    return {
        runMemoryAuditor: mockRunMemoryAuditor,
    };
});

let app;
let originalDemoHomeId;
let originalMcpApiKey;
let originalMcpClusterId;

beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH0_DOMAIN = "test-houseiq.us.auth0.com";
    process.env.AUTH0_AUDIENCE = "https://api.houseiq.app";

    const serverModule = await import("../server.js");
    app = serverModule.app;
});

describe("POST /api/demo/live/ask", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        originalDemoHomeId = process.env.PUBLIC_DEMO_HOME_ID;
        process.env.PUBLIC_DEMO_HOME_ID = DEMO_HOME_ID;

        mockRunReadOnlyAsk.mockResolvedValue({
            question: JUDGE_ASK_QUESTION,
            answer: "Budget for AC replacement.",
            memoriesUsed: [{ title: "Furnace blower" }],
            via: "cockroachdb-vector",
            readOnly: true,
        });
    });

    afterEach(() => {
        if (originalDemoHomeId === undefined) {
            delete process.env.PUBLIC_DEMO_HOME_ID;
        } else {
            process.env.PUBLIC_DEMO_HOME_ID = originalDemoHomeId;
        }
    });

    test("runs without authentication and ignores the request body question", async () => {
        const response = await request(app)
            .post("/api/demo/live/ask")
            .send({
                question: "DROP TABLE memories",
                homeId: "00000000-0000-4000-8000-000000000000",
            });

        expect(response.status).toBe(200);
        expect(response.body.question).toBe(JUDGE_ASK_QUESTION);
        expect(response.body.readOnly).toBe(true);
        expect(mockRunReadOnlyAsk).toHaveBeenCalledWith({
            homeId: DEMO_HOME_ID,
            question: JUDGE_ASK_QUESTION,
        });
    });

    test("returns 503 when the public demo home is not configured", async () => {
        delete process.env.PUBLIC_DEMO_HOME_ID;

        const response = await request(app)
            .post("/api/demo/live/ask")
            .send({});

        expect(response.status).toBe(404);
        expect(mockRunReadOnlyAsk).not.toHaveBeenCalled();
    });
});

describe("POST /api/demo/live/audit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        originalDemoHomeId = process.env.PUBLIC_DEMO_HOME_ID;
        originalMcpApiKey = process.env.COCKROACH_MCP_API_KEY;
        originalMcpClusterId = process.env.COCKROACH_CLUSTER_ID;

        process.env.PUBLIC_DEMO_HOME_ID = DEMO_HOME_ID;
        process.env.COCKROACH_MCP_API_KEY = "test-mcp-key";
        process.env.COCKROACH_CLUSTER_ID = "test-cluster";

        mockRunMemoryAuditor.mockResolvedValue({
            answer: "The furnace is the 2014 Carrier.",
            toolTrace: [
                {
                    tool: "select_query",
                    arguments: { query: "SELECT 1" },
                    rowCount: 1,
                    isError: false,
                },
            ],
            model: "gpt-4o-mini",
            durationMs: 40,
        });

        mockPoolQuery.mockImplementation(async (sql) => {
            const normalized = String(sql)
                .replace(/\s+/g, " ")
                .toLowerCase();

            if (normalized.includes("select id, name from homes")) {
                return {
                    rows: [
                        {
                            id: DEMO_HOME_ID,
                            name: "HouseIQ Demo House",
                        },
                    ],
                };
            }

            if (normalized.includes("insert into agent_runs")) {
                return {
                    rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
                };
            }

            return { rows: [] };
        });
    });

    afterEach(() => {
        if (originalDemoHomeId === undefined) {
            delete process.env.PUBLIC_DEMO_HOME_ID;
        } else {
            process.env.PUBLIC_DEMO_HOME_ID = originalDemoHomeId;
        }

        if (originalMcpApiKey === undefined) {
            delete process.env.COCKROACH_MCP_API_KEY;
        } else {
            process.env.COCKROACH_MCP_API_KEY = originalMcpApiKey;
        }

        if (originalMcpClusterId === undefined) {
            delete process.env.COCKROACH_CLUSTER_ID;
        } else {
            process.env.COCKROACH_CLUSTER_ID = originalMcpClusterId;
        }
    });

    test("runs MCP audit without authentication using the hardcoded furnace question", async () => {
        const response = await request(app)
            .post("/api/demo/live/audit")
            .send({ question: "invented prompt" });

        expect(response.status).toBe(200);
        expect(response.body.question).toBe(JUDGE_AUDIT_QUESTION);
        expect(response.body.via).toBe("cockroachdb-cloud-mcp");
        expect(response.body.toolTrace[0].tool).toBe("select_query");
        expect(mockRunMemoryAuditor).toHaveBeenCalledWith({
            question: JUDGE_AUDIT_QUESTION,
            homeId: DEMO_HOME_ID,
            homeName: "HouseIQ Demo House",
        });
    });

    test("returns 404 when the public demo home is not configured", async () => {
        delete process.env.PUBLIC_DEMO_HOME_ID;

        const response = await request(app)
            .post("/api/demo/live/audit")
            .send({});

        expect(response.status).toBe(404);
        expect(mockRunMemoryAuditor).not.toHaveBeenCalled();
    });
});
