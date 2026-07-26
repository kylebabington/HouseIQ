// backend/tests/agent_context.test.js
//
// These tests confirm the HouseIQ agent endpoint gathers profile
// facts, open issues, active projects, and known assets alongside
// memories before calling the agent, and that it still enforces
// home ownership.

import request from "supertest";

import {
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from "vitest";


// ---------------------------------------------------------
// TEST USERS AND HOMES
// ---------------------------------------------------------

const USER_A_ID =
    "auth0|agent-context-user-a";

const USER_B_ID =
    "auth0|agent-context-user-b";

const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";

const USER_A_ISSUE_ID =
    "33333333-3333-4333-8333-333333333333";

const USER_A_PROJECT_ID =
    "44444444-4444-4444-8444-444444444444";

const USER_A_ASSET_ID =
    "55555555-5555-4555-8555-555555555555";

const USER_A_MEMORY_ID =
    "66666666-6666-4666-8666-666666666666";

const USER_A_AGENT_RUN_ID =
    "77777777-7777-4777-8777-777777777777";


// ---------------------------------------------------------
// HOISTED DATABASE AND AI MOCKS
// ---------------------------------------------------------
//
// vi.hoisted lets these mock functions exist before vi.mock
// factories run, since vi.mock calls are hoisted above imports.
//
const {
    mockPoolQuery,
    mockPoolConnect,
    mockCreateEmbedding,
    mockVectorToSql,
    mockGenerateHouseAgentResponse,
} = vi.hoisted(() => {
    return {
        mockPoolQuery:
            vi.fn(),

        mockPoolConnect:
            vi.fn(),

        mockCreateEmbedding:
            vi.fn(),

        mockVectorToSql:
            vi.fn(),

        mockGenerateHouseAgentResponse:
            vi.fn(),
    };
});


let testDatabase;


// ---------------------------------------------------------
// MOCK AUTH0
// ---------------------------------------------------------

vi.mock("../middleware/auth.js", () => {
    return {
        requireAuth: (
            req,
            res,
            next
        ) => {
            const userId =
                req.header(
                    "x-test-user-id"
                );

            if (!userId) {
                return res
                    .status(401)
                    .json({
                        error:
                            "Authentication required",
                    });
            }

            req.auth = {
                payload: {
                    sub:
                        userId,
                },
            };

            return next();
        },

        getAuthenticatedUserId: (
            req
        ) => {
            const userId =
                req.auth?.payload?.sub;

            if (!userId) {
                throw new Error(
                    "Authenticated token is missing a subject"
                );
            }

            return userId;
        },
    };
});


// ---------------------------------------------------------
// MOCK DATABASE
// ---------------------------------------------------------

vi.mock("../db/pool.js", () => {
    return {
        pool: {
            query:
                mockPoolQuery,

            connect:
                mockPoolConnect,
        },
    };
});


// ---------------------------------------------------------
// MOCK EXTERNAL SERVICES
// ---------------------------------------------------------

vi.mock("../services/s3.js", () => {
    return {
        createDocumentDownloadUrl:
            vi.fn(),

        deleteDocumentFromS3:
            vi.fn(),

        uploadDocumentToS3:
            vi.fn(),
    };
});


vi.mock("../services/ai/index.js", () => {
    return {
        createEmbedding:
            mockCreateEmbedding,

        vectorToSql:
            mockVectorToSql,

        generateHouseAgentResponse:
            mockGenerateHouseAgentResponse,

        analyzeHomeDocument:
            vi.fn(),
    };
});


// ---------------------------------------------------------
// IMPORT THE EXPRESS APP AND THE MOCKED AGENT FUNCTION
// ---------------------------------------------------------
//
// Importing generateHouseAgentResponse from the (mocked) AI
// module lets these tests assert exactly what context object
// the route handler passed to the agent.
//
let app;

let generateHouseAgentResponse;

beforeAll(async () => {
    process.env.NODE_ENV =
        "test";

    process.env.AUTH0_DOMAIN =
        "test-houseiq.us.auth0.com";

    process.env.AUTH0_AUDIENCE =
        "https://api.houseiq.app";

    const serverModule =
        await import(
            "../server.js"
        );

    app =
        serverModule.app;

    const aiModule =
        await import(
            "../services/ai/index.js"
        );

    generateHouseAgentResponse =
        aiModule.generateHouseAgentResponse;
});


// ---------------------------------------------------------
// TEST SETUP
// ---------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();

    testDatabase = {
        homes: [
            {
                id:
                    USER_A_HOME_ID,

                owner_auth0_id:
                    USER_A_ID,

                name:
                    "User A House",

                year_built:
                    1985,

                notes:
                    "Owned by User A",
            },

            {
                id:
                    USER_B_HOME_ID,

                owner_auth0_id:
                    USER_B_ID,

                name:
                    "User B House",

                year_built:
                    2001,

                notes:
                    "Owned by User B",
            },
        ],

        profiles: [
            {
                home_id:
                    USER_A_HOME_ID,

                property_type:
                    "single_family",

                square_feet:
                    2200,

                bedrooms:
                    4,

                full_bathrooms:
                    2,

                half_bathrooms:
                    1,

                stories:
                    2,

                foundation_type:
                    "slab",

                basement_type:
                    null,

                exterior_material:
                    "brick",

                roof_material:
                    "asphalt_shingle",

                heating_type:
                    "forced_air",

                cooling_type:
                    "central_air",

                water_heater_type:
                    "tankless",

                water_source:
                    "municipal",

                sewer_type:
                    "municipal",

                electrical_service_amps:
                    200,

                garage_type:
                    "attached",

                garage_spaces:
                    2,

                lot_size_acres:
                    0.25,

                onboarding_status:
                    "completed",

                onboarding_step:
                    null,

                metadata:
                    {},

                created_at:
                    "2026-07-20T10:00:00.000Z",

                updated_at:
                    "2026-07-20T10:00:00.000Z",
            },
        ],

        issues: [
            {
                id:
                    USER_A_ISSUE_ID,

                home_id:
                    USER_A_HOME_ID,

                title:
                    "Leaking kitchen faucet",

                description:
                    "Slow drip under the sink.",

                status:
                    "open",

                priority:
                    "medium",

                category:
                    "plumbing",

                suspected_cause:
                    "Worn washer",

                recommended_next_step:
                    "Replace washer",

                created_at:
                    "2026-07-21T10:00:00.000Z",

                updated_at:
                    "2026-07-21T10:00:00.000Z",
            },
        ],

        projects: [
            {
                id:
                    USER_A_PROJECT_ID,

                home_id:
                    USER_A_HOME_ID,

                title:
                    "Bathroom remodel",

                description:
                    "Full remodel of the upstairs bathroom.",

                status:
                    "in_progress",

                priority:
                    "medium",

                estimated_cost_low:
                    5000,

                estimated_cost_high:
                    12000,

                diy_difficulty:
                    "professional",

                safety_notes:
                    "",

                created_at:
                    "2026-07-22T10:00:00.000Z",

                updated_at:
                    "2026-07-22T10:00:00.000Z",
            },
        ],

        assets: [
            {
                id:
                    USER_A_ASSET_ID,

                home_id:
                    USER_A_HOME_ID,

                asset_type:
                    "water_heater",

                name:
                    "Tankless water heater",

                brand:
                    "Rheem",

                model:
                    "RTGH-95",

                serial_number:
                    "ABC123",

                location:
                    "Basement",

                notes:
                    "Installed 2020",

                created_at:
                    "2026-07-23T10:00:00.000Z",

                updated_at:
                    "2026-07-23T10:00:00.000Z",
            },
        ],

        memories: [
            {
                id:
                    USER_A_MEMORY_ID,

                home_id:
                    USER_A_HOME_ID,

                title:
                    "Water heater age",

                category:
                    "plumbing",

                content:
                    "The water heater was installed in 2020.",

                metadata:
                    {},

                importance:
                    4,

                created_at:
                    "2026-07-24T10:00:00.000Z",
            },
        ],
    };


    mockCreateEmbedding.mockResolvedValue(
        Array(1536).fill(0)
    );

    mockVectorToSql.mockReturnValue(
        "[0,0,0]"
    );

    mockGenerateHouseAgentResponse.mockResolvedValue({
        answer:
            "Based on your tankless water heater and forced air heating, here's what I'd check first.",

        confidence:
            "medium",

        needsMoreInfo:
            false,

        clarifyingQuestions:
            [],

        memoriesToCreate:
            [],

        issuesToCreate:
            [],

        projectsToCreate:
            [],

        assetsToCreate:
            [],
    });


    mockPoolConnect.mockImplementation(
        async () => {
            return {
                query:
                    mockPoolQuery,

                release:
                    vi.fn(),
            };
        }
    );


    mockPoolQuery.mockImplementation(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                normalizeSql(sql);


            // ---------------------------------------------
            // TRANSACTION CONTROL
            // ---------------------------------------------

            if (
                normalizedSql === "begin" ||
                normalizedSql === "commit" ||
                normalizedSql === "rollback"
            ) {
                return {
                    rows: [],
                    rowCount: 0,
                };
            }


            // ---------------------------------------------
            // HOME OWNERSHIP MIDDLEWARE
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "select id, owner_auth0_id from homes"
                ) &&
                normalizedSql.includes(
                    "where id = $1"
                ) &&
                normalizedSql.includes(
                    "and owner_auth0_id = $2"
                )
            ) {
                const [
                    homeId,
                    ownerAuth0Id,
                ] = parameters;

                const home =
                    testDatabase.homes.find(
                        (candidate) =>
                            candidate.id === homeId &&
                            candidate.owner_auth0_id ===
                            ownerAuth0Id
                    );

                return {
                    rows:
                        home
                            ? [
                                {
                                    id:
                                        home.id,

                                    owner_auth0_id:
                                        home.owner_auth0_id,
                                },
                            ]
                            : [],

                    rowCount:
                        home ? 1 : 0,
                };
            }


            // ---------------------------------------------
            // SELECT HOME BY ID (agent route step 1)
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "select id, name, year_built, notes"
                ) &&
                normalizedSql.includes(
                    "from homes"
                ) &&
                normalizedSql.includes(
                    "where id = $1"
                ) &&
                !normalizedSql.includes(
                    "owner_auth0_id"
                )
            ) {
                const [homeId] = parameters;

                const home =
                    testDatabase.homes.find(
                        (candidate) =>
                            candidate.id === homeId
                    );

                return {
                    rows:
                        home
                            ? [
                                {
                                    id:
                                        home.id,

                                    name:
                                        home.name,

                                    year_built:
                                        home.year_built,

                                    notes:
                                        home.notes,
                                },
                            ]
                            : [],

                    rowCount:
                        home ? 1 : 0,
                };
            }


            // ---------------------------------------------
            // SELECT HOME PROFILE
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from home_profiles"
                ) &&
                normalizedSql.includes(
                    "where home_id = $1"
                )
            ) {
                const [homeId] = parameters;

                const profile =
                    testDatabase.profiles.find(
                        (candidate) =>
                            candidate.home_id === homeId
                    );

                return {
                    rows:
                        profile ? [profile] : [],

                    rowCount:
                        profile ? 1 : 0,
                };
            }


            // ---------------------------------------------
            // SELECT OPEN HOME ISSUES
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from home_issues"
                ) &&
                normalizedSql.includes(
                    "where home_id = $1"
                )
            ) {
                const [homeId] = parameters;

                const rows =
                    testDatabase.issues.filter(
                        (issue) =>
                            issue.home_id === homeId
                    );

                return {
                    rows,
                    rowCount:
                        rows.length,
                };
            }


            // ---------------------------------------------
            // SELECT ACTIVE HOME PROJECTS
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from home_projects"
                ) &&
                normalizedSql.includes(
                    "where home_id = $1"
                )
            ) {
                const [homeId] = parameters;

                const rows =
                    testDatabase.projects.filter(
                        (project) =>
                            project.home_id === homeId
                    );

                return {
                    rows,
                    rowCount:
                        rows.length,
                };
            }


            // ---------------------------------------------
            // SELECT HOME ASSETS
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from home_assets"
                ) &&
                normalizedSql.includes(
                    "where home_id = $1"
                )
            ) {
                const [homeId] = parameters;

                const rows =
                    testDatabase.assets.filter(
                        (asset) =>
                            asset.home_id === homeId
                    );

                return {
                    rows,
                    rowCount:
                        rows.length,
                };
            }


            // ---------------------------------------------
            // MEMORY VECTOR SEARCH
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from memories"
                ) &&
                normalizedSql.includes(
                    "where home_id = $1"
                ) &&
                normalizedSql.includes(
                    "embedding is not null"
                )
            ) {
                const [homeId] = parameters;

                const rows =
                    testDatabase.memories.filter(
                        (memory) =>
                            memory.home_id === homeId
                    );

                return {
                    rows,
                    rowCount:
                        rows.length,
                };
            }


            // ---------------------------------------------
            // INSERT AGENT RUN
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "insert into agent_runs"
                )
            ) {
                return {
                    rows: [
                        {
                            id:
                                USER_A_AGENT_RUN_ID,

                            home_id:
                                parameters[0],

                            user_question:
                                parameters[1],

                            answer:
                                parameters[2],

                            status:
                                parameters[3],
                        },
                    ],

                    rowCount: 1,
                };
            }


            throw new Error(
                [
                    "The fake database received an SQL query",
                    "that this test file does not recognize:",
                    normalizedSql,
                ].join("\n")
            );
        }
    );
});


function normalizeSql(sql) {
    return sql
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


// ---------------------------------------------------------
// TESTS
// ---------------------------------------------------------

describe(
    "HouseIQ agent context gathering",
    () => {
        test(
            "the owner asking a question receives 200 and the agent is called with profile, issue, project, and asset context",
            async () => {
                const response =
                    await request(app)
                        .post(
                            `/api/homes/${USER_A_HOME_ID}/ask`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            question:
                                "Is my water heater okay?",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    generateHouseAgentResponse
                ).toHaveBeenCalledTimes(1);

                const [
                    calledQuestion,
                    calledContext,
                ] =
                    generateHouseAgentResponse.mock
                        .calls[0];

                expect(calledQuestion).toBe(
                    "Is my water heater okay?"
                );

                expect(
                    calledContext.home
                ).toMatchObject({
                    id: USER_A_HOME_ID,
                    name: "User A House",
                });

                expect(
                    calledContext.profile
                ).toBeTruthy();

                expect(
                    calledContext.profile.heatingType
                ).toBe("forced_air");

                expect(
                    Array.isArray(
                        calledContext.issues
                    )
                ).toBe(true);

                expect(
                    calledContext.issues
                ).toHaveLength(1);

                expect(
                    calledContext.issues[0].title
                ).toBe(
                    "Leaking kitchen faucet"
                );

                expect(
                    Array.isArray(
                        calledContext.projects
                    )
                ).toBe(true);

                expect(
                    calledContext.projects
                ).toHaveLength(1);

                expect(
                    Array.isArray(
                        calledContext.assets
                    )
                ).toBe(true);

                expect(
                    calledContext.assets
                ).toHaveLength(1);

                expect(
                    Array.isArray(
                        calledContext.memories
                    )
                ).toBe(true);

                expect(
                    calledContext.memories
                ).toHaveLength(1);

                // The response should surface a server-computed
                // contextUsed summary, not something the model made up.
                expect(
                    response.body.contextUsed
                ).toBeTruthy();

                expect(
                    response.body.contextUsed.issueTitles
                ).toEqual([
                    "Leaking kitchen faucet",
                ]);

                expect(
                    response.body.contextUsed.assetNames
                ).toEqual([
                    "Tankless water heater",
                ]);

                expect(
                    response.body.contextUsed.projectTitles
                ).toEqual([
                    "Bathroom remodel",
                ]);

                expect(
                    response.body.contextUsed.profileFields
                ).toContain("heatingType");

                expect(
                    response.body.contextUsed.counts
                ).toMatchObject({
                    memories: 1,
                    issues: 1,
                    projects: 1,
                    assets: 1,
                });
            }
        );


        test(
            "a user who does not own the home receives 404 and the agent is never called",
            async () => {
                const response =
                    await request(app)
                        .post(
                            `/api/homes/${USER_A_HOME_ID}/ask`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        )
                        .send({
                            question:
                                "Is my water heater okay?",
                        });

                expect(
                    response.status
                ).toBe(404);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "Home not found",
                });

                expect(
                    generateHouseAgentResponse
                ).not.toHaveBeenCalled();
            }
        );
    }
);
