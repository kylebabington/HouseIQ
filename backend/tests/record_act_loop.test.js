// backend/tests/record_act_loop.test.js
//
// These tests confirm the record "ACT loop" routes let a
// home owner review and correct AI-created records (issues,
// projects, tasks, assets, memories) while still enforcing
// home ownership and field validation.

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
// TEST USERS, HOMES, AND RECORDS
// ---------------------------------------------------------

const USER_A_ID =
    "auth0|record-act-loop-user-a";

const USER_B_ID =
    "auth0|record-act-loop-user-b";

const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";

const USER_A_ISSUE_ID =
    "33333333-3333-4333-8333-333333333333";

const USER_A_PROJECT_ID =
    "44444444-4444-4444-8444-444444444444";

const USER_A_TASK_ID =
    "55555555-5555-4555-8555-555555555555";

const USER_A_ASSET_ID =
    "66666666-6666-4666-8666-666666666666";

const USER_A_MEMORY_ID =
    "77777777-7777-4777-8777-777777777777";


// ---------------------------------------------------------
// HOISTED DATABASE MOCKS
// ---------------------------------------------------------

const {
    mockPoolQuery,
    mockPoolConnect,
} = vi.hoisted(() => {
    return {
        mockPoolQuery:
            vi.fn(),

        mockPoolConnect:
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
            vi.fn(),

        vectorToSql:
            vi.fn(),

        generateHouseAgentResponse:
            vi.fn(),

        analyzeHomeDocument:
            vi.fn(),
    };
});


// ---------------------------------------------------------
// IMPORT EXPRESS APP
// ---------------------------------------------------------

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
// TEST SETUP
// ---------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();

    mockPoolConnect.mockRejectedValue(
        new Error(
            "pool.connect was not expected in record act loop tests"
        )
    );

    testDatabase = {
        homes: [
            {
                id:
                    USER_A_HOME_ID,

                owner_auth0_id:
                    USER_A_ID,
            },

            {
                id:
                    USER_B_HOME_ID,

                owner_auth0_id:
                    USER_B_ID,
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
                    "planned",

                priority:
                    "medium",

                created_at:
                    "2026-07-22T10:00:00.000Z",

                updated_at:
                    "2026-07-22T10:00:00.000Z",
            },
        ],

        tasks: [
            {
                id:
                    USER_A_TASK_ID,

                project_id:
                    USER_A_PROJECT_ID,

                task_order:
                    1,

                title:
                    "Remove old tile",

                description:
                    null,

                status:
                    "todo",

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

                importance:
                    4,

                created_at:
                    "2026-07-24T10:00:00.000Z",

                updated_at:
                    "2026-07-24T10:00:00.000Z",
            },
        ],
    };


    mockPoolQuery.mockImplementation(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                normalizeSql(sql);


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
            // UPDATE HOME ISSUE
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "update home_issues"
                )
            ) {
                const [
                    issueId,
                    homeId,
                    ...values
                ] = parameters;

                const issue =
                    testDatabase.issues.find(
                        (candidate) =>
                            candidate.id === issueId &&
                            candidate.home_id === homeId
                    );

                if (!issue) {
                    return { rows: [], rowCount: 0 };
                }

                applySetColumns(
                    issue,
                    normalizedSql,
                    values
                );

                return {
                    rows: [{ ...issue }],
                    rowCount: 1,
                };
            }


            // ---------------------------------------------
            // UPDATE HOME PROJECT
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "update home_projects"
                )
            ) {
                const [
                    projectId,
                    homeId,
                    ...values
                ] = parameters;

                const project =
                    testDatabase.projects.find(
                        (candidate) =>
                            candidate.id === projectId &&
                            candidate.home_id === homeId
                    );

                if (!project) {
                    return { rows: [], rowCount: 0 };
                }

                applySetColumns(
                    project,
                    normalizedSql,
                    values
                );

                return {
                    rows: [{ ...project }],
                    rowCount: 1,
                };
            }


            // ---------------------------------------------
            // UPDATE PROJECT TASK
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "update project_tasks"
                )
            ) {
                const [
                    taskId,
                    projectId,
                    homeId,
                    ...values
                ] = parameters;

                const project =
                    testDatabase.projects.find(
                        (candidate) =>
                            candidate.id === projectId &&
                            candidate.home_id === homeId
                    );

                if (!project) {
                    return { rows: [], rowCount: 0 };
                }

                const task =
                    testDatabase.tasks.find(
                        (candidate) =>
                            candidate.id === taskId &&
                            candidate.project_id === projectId
                    );

                if (!task) {
                    return { rows: [], rowCount: 0 };
                }

                applySetColumns(
                    task,
                    normalizedSql,
                    values
                );

                return {
                    rows: [{ ...task }],
                    rowCount: 1,
                };
            }


            // ---------------------------------------------
            // UPDATE HOME ASSET
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "update home_assets"
                )
            ) {
                const [
                    assetId,
                    homeId,
                    ...values
                ] = parameters;

                const asset =
                    testDatabase.assets.find(
                        (candidate) =>
                            candidate.id === assetId &&
                            candidate.home_id === homeId
                    );

                if (!asset) {
                    return { rows: [], rowCount: 0 };
                }

                applySetColumns(
                    asset,
                    normalizedSql,
                    values
                );

                return {
                    rows: [{ ...asset }],
                    rowCount: 1,
                };
            }


            // ---------------------------------------------
            // READ MEMORY BEFORE RE-EMBED ON PATCH
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "select title, category, content, metadata"
                ) &&
                normalizedSql.includes(
                    "from memories"
                )
            ) {
                const [
                    memoryId,
                    homeId,
                ] = parameters;

                const memory =
                    testDatabase.memories.find(
                        (candidate) =>
                            candidate.id === memoryId &&
                            candidate.home_id === homeId
                    );

                return {
                    rows: memory ? [{ ...memory }] : [],
                    rowCount: memory ? 1 : 0,
                };
            }


            // ---------------------------------------------
            // UPDATE MEMORY
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "update memories"
                )
            ) {
                const [
                    memoryId,
                    homeId,
                    ...values
                ] = parameters;

                const memory =
                    testDatabase.memories.find(
                        (candidate) =>
                            candidate.id === memoryId &&
                            candidate.home_id === homeId
                    );

                if (!memory) {
                    return { rows: [], rowCount: 0 };
                }

                applySetColumns(
                    memory,
                    normalizedSql,
                    values
                );

                return {
                    rows: [{ ...memory }],
                    rowCount: 1,
                };
            }


            // ---------------------------------------------
            // DELETE MEMORY
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "delete from memories"
                )
            ) {
                const [
                    memoryId,
                    homeId,
                ] = parameters;

                const index =
                    testDatabase.memories.findIndex(
                        (candidate) =>
                            candidate.id === memoryId &&
                            candidate.home_id === homeId
                    );

                if (index === -1) {
                    return { rows: [], rowCount: 0 };
                }

                const [deleted] =
                    testDatabase.memories.splice(
                        index,
                        1
                    );

                return {
                    rows: [{ id: deleted.id }],
                    rowCount: 1,
                };
            }


            throw new Error(
                [
                    "Unexpected SQL in record act loop test:",
                    normalizedSql,
                ].join("\n")
            );
        }
    );
});


// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function normalizeSql(sql) {
    return sql
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


// Parses "column_a = $3, column_b = $4" out of the SQL's SET
// clause and applies the matching values (in order) onto the
// in-memory fake record.
function applySetColumns(
    record,
    normalizedSql,
    values
) {
    const match = normalizedSql.match(
        /set (.+?), updated_at = now\(\)/
    );

    if (!match) {
        throw new Error(
            "Could not parse SET clause from: " +
            normalizedSql
        );
    }

    const columns = match[1]
        .split(",")
        .map((clause) =>
            clause.trim().split(" = ")[0].trim()
        );

    columns.forEach((column, index) => {
        record[column] = values[index];
    });
}


// ---------------------------------------------------------
// TESTS
// ---------------------------------------------------------

describe(
    "record act loop authorization and validation",
    () => {
        test(
            "the owner can PATCH an issue's status and receives 200",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/issues/${USER_A_ISSUE_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "resolved",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body.status
                ).toBe("resolved");

                expect(
                    response.body.id
                ).toBe(USER_A_ISSUE_ID);
            }
        );


        test(
            "a user who does not own the home receives 404 when patching an issue",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/issues/${USER_A_ISSUE_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        )
                        .send({
                            status:
                                "resolved",
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
            }
        );


        test(
            "an invalid issue status is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/issues/${USER_A_ISSUE_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "not_a_real_status",
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body.fields.status
                ).toMatch(
                    /status must be one of/
                );
            }
        );


        test(
            "an invalid issue priority is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/issues/${USER_A_ISSUE_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            priority:
                                "extreme",
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body.fields.priority
                ).toMatch(
                    /priority must be one of/
                );
            }
        );


        test(
            "an unknown field on an issue update is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/issues/${USER_A_ISSUE_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            homeId:
                                USER_B_HOME_ID,
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body.fields.homeId
                ).toBe(
                    "This field cannot be updated"
                );
            }
        );


        test(
            "the owner can PATCH a project's status and receives 200",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/projects/${USER_A_PROJECT_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "in_progress",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body.status
                ).toBe("in_progress");
            }
        );


        test(
            "an invalid project status is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/projects/${USER_A_PROJECT_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "on_hold",
                        });

                expect(
                    response.status
                ).toBe(400);
            }
        );


        test(
            "the owner can PATCH a project task's status and receives 200",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/projects/${USER_A_PROJECT_ID}/tasks/${USER_A_TASK_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "done",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body.status
                ).toBe("done");
            }
        );


        test(
            "an invalid task status is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/projects/${USER_A_PROJECT_ID}/tasks/${USER_A_TASK_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            status:
                                "in_review",
                        });

                expect(
                    response.status
                ).toBe(400);
            }
        );


        test(
            "the owner can PATCH an asset's editable fields and receives 200",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/assets/${USER_A_ASSET_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            location:
                                "Garage",

                            notes:
                                "Moved during renovation",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body.location
                ).toBe("Garage");

                expect(
                    response.body.notes
                ).toBe(
                    "Moved during renovation"
                );
            }
        );


        test(
            "a user who does not own the home receives 404 when patching an asset",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/assets/${USER_A_ASSET_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        )
                        .send({
                            location:
                                "Garage",
                        });

                expect(
                    response.status
                ).toBe(404);
            }
        );


        test(
            "the owner can PATCH a memory's editable fields and receives 200",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/memories/${USER_A_MEMORY_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            importance:
                                5,

                            title:
                                "Water heater install year",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body.importance
                ).toBe(5);

                expect(
                    response.body.title
                ).toBe(
                    "Water heater install year"
                );
            }
        );


        test(
            "an invalid memory importance is rejected with 400",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/memories/${USER_A_MEMORY_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            importance:
                                9,
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body.fields.importance
                ).toMatch(
                    /importance must be a whole number/
                );
            }
        );


        test(
            "the owner can DELETE a memory and receives 200",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/homes/${USER_A_HOME_ID}/memories/${USER_A_MEMORY_ID}`
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
                ).toEqual({
                    success: true,
                    id: USER_A_MEMORY_ID,
                });

                expect(
                    testDatabase.memories
                ).toHaveLength(0);
            }
        );


        test(
            "a user who does not own the home receives 404 when deleting a memory",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/homes/${USER_A_HOME_ID}/memories/${USER_A_MEMORY_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        );

                expect(
                    response.status
                ).toBe(404);

                expect(
                    testDatabase.memories
                ).toHaveLength(1);
            }
        );
    }
);
