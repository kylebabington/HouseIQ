// backend/tests/authorization.test.js

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
// TEST IDENTITIES
// ---------------------------------------------------------
//
// These are fake Auth0 subject values.
//
// They follow the same general format as real Auth0 `sub`
// claims, but they do not belong to real users.
//
const USER_A_ID =
    "auth0|houseiq-test-user-a";

const USER_B_ID =
    "auth0|houseiq-test-user-b";


// ---------------------------------------------------------
// TEST RESOURCE IDS
// ---------------------------------------------------------
//
// HouseIQ validates route IDs as standard UUIDs, so our test
// data must use valid UUID strings.
//
const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";

const USER_A_MEMORY_ID =
    "33333333-3333-4333-8333-333333333333";


// ---------------------------------------------------------
// IN-MEMORY TEST DATABASE
// ---------------------------------------------------------
//
// This object acts like a tiny fake database.
//
// Each test resets it so one test cannot accidentally affect
// another test.
//
let testDatabase;


// ---------------------------------------------------------
// MOCK AUTH0
// ---------------------------------------------------------
//
// We do not want these tests to:
//
// - contact Auth0
// - create real JWTs
// - depend on Auth0 network availability
// - contain private signing keys
//
// Instead, the test sends:
//
// x-test-user-id: auth0|houseiq-test-user-a
//
// The fake middleware places that value into the same request
// location used by the real application:
//
// req.auth.payload.sub
//
vi.mock("../middleware/auth.js", () => {
    return {
        requireAuth: (
            req,
            res,
            next
        ) => {
            const testUserId =
                req.header(
                    "x-test-user-id"
                );

            if (!testUserId) {
                return res
                    .status(401)
                    .json({
                        error:
                            "Authentication required",
                    });
            }

            req.auth = {
                payload: {
                    sub: testUserId,
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
// MOCK AI FUNCTIONS
// ---------------------------------------------------------
//
// The authorization tests should not call OpenAI.
//
// These tests are about:
// - authentication
// - ownership
// - route access
//
// AI behavior belongs in a different test suite.
//
vi.mock("../services/ai/index.js", () => {
    return {
        createEmbedding:
            vi.fn(async () =>
                Array(1536).fill(0)
            ),

        vectorToSql:
            vi.fn(() =>
                "[0,0,0]"
            ),

        generateHouseAgentResponse:
            vi.fn(async () => ({
                answer:
                    "Test agent response",
                confidence: 1,
                needsMoreInfo: false,
                clarifyingQuestions: [],
                memoriesToCreate: [],
                issuesToCreate: [],
                projectsToCreate: [],
                assetsToCreate: [],
            })),

        analyzeHomeDocument:
            vi.fn(async () => ({
                summary:
                    "Test document summary",
                documentDate: null,
                contractorOrCompany:
                    null,
                memoriesToCreate: [],
                issuesToCreate: [],
                projectsToCreate: [],
                assetsToCreate: [],
            })),
    };
});


// ---------------------------------------------------------
// MOCK S3 FUNCTIONS
// ---------------------------------------------------------
//
// Authorization tests must never:
//
// - upload a real file
// - generate a real signed URL
// - delete a real S3 object
//
vi.mock("../services/s3.js", () => {
    return {
        uploadDocumentToS3:
            vi.fn(async () => ({
                bucket:
                    "houseiq-test-bucket",
                key:
                    "test/document.txt",
                s3Uri:
                    "s3://houseiq-test-bucket/test/document.txt",
                etag:
                    "test-etag",
            })),

        createDocumentDownloadUrl:
            vi.fn(async () =>
                "https://example.test/signed-download"
            ),

        deleteDocumentFromS3:
            vi.fn(async () => { }),
    };
});


// ---------------------------------------------------------
// MOCK COCKROACHDB
// ---------------------------------------------------------
//
// The route handlers still execute their normal SQL calls.
//
// This fake query function examines the SQL and returns rows
// from our in-memory testDatabase.
//
const mockQuery =
    vi.fn(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                sql
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();


            // -------------------------------------------------
            // LIST HOMES FOR THE AUTHENTICATED USER
            // -------------------------------------------------

            if (
                normalizedSql.includes(
                    "from homes"
                ) &&
                normalizedSql.includes(
                    "where owner_auth0_id = $1"
                ) &&
                normalizedSql.includes(
                    "order by created_at desc"
                )
            ) {
                const [ownerAuth0Id] =
                    parameters;

                const rows =
                    testDatabase.homes
                        .filter(
                            (home) =>
                                home.owner_auth0_id ===
                                ownerAuth0Id
                        )
                        .map(
                            ({
                                owner_auth0_id,
                                ...publicHome
                            }) =>
                                publicHome
                        );

                return {
                    rows,
                    rowCount:
                        rows.length,
                };
            }


            // -------------------------------------------------
            // CREATE A HOME
            // -------------------------------------------------

            if (
                normalizedSql.includes(
                    "insert into homes"
                )
            ) {
                const [
                    ownerAuth0Id,
                    name,
                    yearBuilt,
                    notes,
                ] = parameters;

                if (!ownerAuth0Id) {
                    const error =
                        new Error(
                            "owner_auth0_id cannot be null"
                        );

                    error.code =
                        "23502";

                    throw error;
                }

                const newHome = {
                    id:
                        "44444444-4444-4444-8444-444444444444",

                    owner_auth0_id:
                        ownerAuth0Id,

                    name,

                    year_built:
                        yearBuilt,

                    notes,

                    created_at:
                        "2026-07-24T12:00:00.000Z",

                    updated_at:
                        "2026-07-24T12:00:00.000Z",
                };

                testDatabase.homes.push(
                    newHome
                );

                const {
                    owner_auth0_id,
                    ...returnedHome
                } = newHome;

                return {
                    rows: [
                        returnedHome,
                    ],
                    rowCount: 1,
                };
            }


            // -------------------------------------------------
            // VERIFY HOME OWNERSHIP
            // -------------------------------------------------
            //
            // This matches requireHomeOwnership.
            //

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
                            candidate.id ===
                            homeId &&
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
                        home
                            ? 1
                            : 0,
                };
            }


            // -------------------------------------------------
            // LIST MEMORIES FOR AN AUTHORIZED HOME
            // -------------------------------------------------

                if (
                normalizedSql.includes(
                    "from memories"
                ) &&
                normalizedSql.includes(
                    "home_id = $1"
                )
            ) {
                const [homeId] =
                    parameters;

                const rows =
                    testDatabase.memories.filter(
                        (memory) =>
                            memory.home_id ===
                            homeId
                    );

                return {
                    rows,
                    rowCount:
                        rows.length,
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


vi.mock("../db/pool.js", () => {
    return {
        pool: {
            query: mockQuery,

            connect:
                vi.fn(async () => {
                    return {
                        query:
                            mockQuery,

                        release:
                            vi.fn(),
                    };
                }),
        },
    };
});


// ---------------------------------------------------------
// IMPORT THE EXPRESS APP
// ---------------------------------------------------------
//
// This import happens after the mock declarations.
//
// Vitest hoists vi.mock calls, so server.js receives the fake
// auth, database, AI, and S3 modules.
//
let app;

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
});


// ---------------------------------------------------------
// RESET TEST DATA
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

                created_at:
                    "2026-07-24T10:00:00.000Z",

                updated_at:
                    "2026-07-24T10:00:00.000Z",
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

                created_at:
                    "2026-07-24T11:00:00.000Z",

                updated_at:
                    "2026-07-24T11:00:00.000Z",
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
                    "The water heater was installed in 2018.",

                importance: 4,

                metadata: {},

                created_at:
                    "2026-07-24T10:30:00.000Z",

                updated_at:
                    "2026-07-24T10:30:00.000Z",
            },
        ],
    };
});


// ---------------------------------------------------------
// TESTS: AUTHENTICATION
// ---------------------------------------------------------

describe(
    "HouseIQ authentication boundaries",
    () => {
        test(
            "GET /api/homes returns 401 without authentication",
            async () => {
                const response =
                    await request(
                        app
                    ).get(
                        "/api/homes"
                    );

                expect(
                    response.status
                ).toBe(401);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "Authentication required",
                });
            }
        );
    }
);


// ---------------------------------------------------------
// TESTS: HOME COLLECTION OWNERSHIP
// ---------------------------------------------------------

describe(
    "HouseIQ home collection authorization",
    () => {
        test(
            "User A can list User A's homes",
            async () => {
                const response =
                    await request(app)
                        .get(
                            "/api/homes"
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body
                ).toHaveLength(1);

                expect(
                    response.body[0]
                        .id
                ).toBe(
                    USER_A_HOME_ID
                );

                expect(
                    response.body[0]
                        .name
                ).toBe(
                    "User A House"
                );
            }
        );


        test(
            "User B cannot see User A's home in the home list",
            async () => {
                const response =
                    await request(app)
                        .get(
                            "/api/homes"
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        );

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body
                ).toHaveLength(1);

                expect(
                    response.body[0]
                        .id
                ).toBe(
                    USER_B_HOME_ID
                );

                const returnedIds =
                    response.body.map(
                        (home) =>
                            home.id
                    );

                expect(
                    returnedIds
                ).not.toContain(
                    USER_A_HOME_ID
                );
            }
        );


        test(
            "creating a home assigns ownership from the authenticated user",
            async () => {
                const response =
                    await request(app)
                        .post(
                            "/api/homes"
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            name:
                                "New Test Home",

                            yearBuilt:
                                1997,

                            notes:
                                "Created by User A",
                        });

                expect(
                    response.status
                ).toBe(201);

                const createdHome =
                    testDatabase.homes.find(
                        (home) =>
                            home.id ===
                            response.body.id
                    );

                expect(
                    createdHome
                ).toBeDefined();

                expect(
                    createdHome
                        .owner_auth0_id
                ).toBe(
                    USER_A_ID
                );
            }
        );


        test(
            "the request body cannot choose a different home owner",
            async () => {
                const response =
                    await request(app)
                        .post(
                            "/api/homes"
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            name:
                                "Attempted Ownership Override",

                            ownerAuth0Id:
                                USER_B_ID,
                        });

                expect(
                    response.status
                ).toBe(201);

                const createdHome =
                    testDatabase.homes.find(
                        (home) =>
                            home.id ===
                            response.body.id
                    );

                expect(
                    createdHome
                        .owner_auth0_id
                ).toBe(
                    USER_A_ID
                );

                expect(
                    createdHome
                        .owner_auth0_id
                ).not.toBe(
                    USER_B_ID
                );
            }
        );
    }
);


// ---------------------------------------------------------
// TESTS: HOME RESOURCE OWNERSHIP
// ---------------------------------------------------------

describe(
    "HouseIQ home-resource authorization",
    () => {
        test(
            "User A can read memories belonging to User A's home",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/homes/${USER_A_HOME_ID}/memories`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body
                ).toHaveLength(1);

                expect(
                    response.body[0]
                        .id
                ).toBe(
                    USER_A_MEMORY_ID
                );
            }
        );


        test(
            "User B receives 404 when reading User A's memories",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/homes/${USER_A_HOME_ID}/memories`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        );

                expect(
                    response.status
                ).toBe(404);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "Home not found",
                });
            }
        );


        test(
            "a malformed home UUID returns 400 instead of reaching CockroachDB",
            async () => {
                const response =
                    await request(app)
                        .get(
                            "/api/homes/not-a-valid-uuid/memories"
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "A valid home ID is required",
                });

                expect(
                    mockQuery
                ).not.toHaveBeenCalled();
            }
        );
    }
);