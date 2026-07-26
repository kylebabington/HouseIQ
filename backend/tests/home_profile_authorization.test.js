// backend/tests/home_profile_authorization.test.js

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
    "auth0|home-profile-user-a";

const USER_B_ID =
    "auth0|home-profile-user-b";

const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";


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

vi.mock("../auth.js", () => {
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

vi.mock("../db.js", () => {
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

vi.mock("../s3.js", () => {
    return {
        createDocumentDownloadUrl:
            vi.fn(),

        deleteDocumentFromS3:
            vi.fn(),

        uploadDocumentToS3:
            vi.fn(),
    };
});


vi.mock("../ai.js", () => {
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
            },
        ],

        profiles:
            [],
    };


    mockPoolConnect
        .mockRejectedValue(
            new Error(
                "pool.connect was not expected in profile tests"
            )
        );


    mockPoolQuery.mockImplementation(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                normalizeSql(
                    sql
                );


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
                ] =
                    parameters;

                const home =
                    testDatabase.homes.find(
                        (candidate) =>
                            candidate.id ===
                            homeId &&
                            candidate
                                .owner_auth0_id ===
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
                                        home
                                            .owner_auth0_id,
                                },
                            ]
                            : [],

                    rowCount:
                        home
                            ? 1
                            : 0,
                };
            }


            // ---------------------------------------------
            // GET PROFILE WITH LEFT JOIN
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "from homes"
                ) &&
                normalizedSql.includes(
                    "left join home_profiles"
                ) &&
                normalizedSql.includes(
                    "where homes.id = $1"
                )
            ) {
                const [
                    homeId,
                ] =
                    parameters;

                const home =
                    testDatabase.homes.find(
                        (candidate) =>
                            candidate.id ===
                            homeId
                    );

                if (!home) {
                    return {
                        rows:
                            [],

                        rowCount:
                            0,
                    };
                }

                const profile =
                    testDatabase.profiles.find(
                        (candidate) =>
                            candidate.home_id ===
                            homeId
                    );

                return {
                    rows: [
                        buildJoinedRow(
                            home,
                            profile
                        ),
                    ],

                    rowCount:
                        1,
                };
            }


            // ---------------------------------------------
            // UPSERT PROFILE
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "insert into home_profiles"
                ) &&
                normalizedSql.includes(
                    "on conflict"
                )
            ) {
                const [
                    homeId,
                    ...values
                ] =
                    parameters;

                const insertSection =
                    normalizedSql.match(
                        /insert into home_profiles \((.*?)\) values/
                    );

                if (
                    !insertSection
                ) {
                    throw new Error(
                        "Could not parse profile insert columns"
                    );
                }

                const columns =
                    insertSection[1]
                        .split(",")
                        .map(
                            (column) =>
                                column.trim()
                        );

                const updateColumns =
                    columns.slice(1);

                let profile =
                    testDatabase.profiles.find(
                        (candidate) =>
                            candidate.home_id ===
                            homeId
                    );

                const now =
                    "2026-07-25T15:00:00.000Z";

                if (!profile) {
                    profile = {
                        id:
                            "33333333-3333-4333-8333-333333333333",

                        home_id:
                            homeId,

                        property_type:
                            null,

                        square_feet:
                            null,

                        bedrooms:
                            null,

                        full_bathrooms:
                            null,

                        half_bathrooms:
                            null,

                        stories:
                            null,

                        foundation_type:
                            null,

                        basement_type:
                            null,

                        exterior_material:
                            null,

                        roof_material:
                            null,

                        heating_type:
                            null,

                        cooling_type:
                            null,

                        water_heater_type:
                            null,

                        water_source:
                            null,

                        sewer_type:
                            null,

                        electrical_service_amps:
                            null,

                        garage_type:
                            null,

                        garage_spaces:
                            null,

                        lot_size_acres:
                            null,

                        onboarding_status:
                            "not_started",

                        onboarding_step:
                            null,

                        metadata:
                            {},

                        created_at:
                            now,

                        updated_at:
                            now,
                    };

                    testDatabase.profiles.push(
                        profile
                    );
                }

                updateColumns.forEach(
                    (
                        column,
                        index
                    ) => {
                        profile[
                            column
                        ] =
                            values[index];
                    }
                );

                profile.updated_at =
                    now;

                return {
                    rows: [
                        {
                            ...profile,
                        },
                    ],

                    rowCount:
                        1,
                };
            }


            // ---------------------------------------------
            // LOAD BASIC HOME AFTER PATCH
            // ---------------------------------------------

            if (
                normalizedSql.includes(
                    "select id, name, year_built from homes"
                ) &&
                normalizedSql.includes(
                    "where id = $1"
                )
            ) {
                const [
                    homeId,
                ] =
                    parameters;

                const home =
                    testDatabase.homes.find(
                        (candidate) =>
                            candidate.id ===
                            homeId
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
                                },
                            ]
                            : [],

                    rowCount:
                        home
                            ? 1
                            : 0,
                };
            }


            throw new Error(
                [
                    "Unexpected SQL in home profile test:",
                    normalizedSql,
                ].join("\n")
            );
        }
    );
});


// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function normalizeSql(
    sql
) {
    return sql
        .replace(
            /\s+/g,
            " "
        )
        .trim()
        .toLowerCase();
}


function buildJoinedRow(
    home,
    profile
) {
    return {
        home_id:
            home.id,

        home_name:
            home.name,

        year_built:
            home.year_built,

        property_type:
            profile?.property_type ??
            null,

        square_feet:
            profile?.square_feet ??
            null,

        bedrooms:
            profile?.bedrooms ??
            null,

        full_bathrooms:
            profile?.full_bathrooms ??
            null,

        half_bathrooms:
            profile?.half_bathrooms ??
            null,

        stories:
            profile?.stories ??
            null,

        foundation_type:
            profile?.foundation_type ??
            null,

        basement_type:
            profile?.basement_type ??
            null,

        exterior_material:
            profile?.exterior_material ??
            null,

        roof_material:
            profile?.roof_material ??
            null,

        heating_type:
            profile?.heating_type ??
            null,

        cooling_type:
            profile?.cooling_type ??
            null,

        water_heater_type:
            profile?.water_heater_type ??
            null,

        water_source:
            profile?.water_source ??
            null,

        sewer_type:
            profile?.sewer_type ??
            null,

        electrical_service_amps:
            profile?.electrical_service_amps ??
            null,

        garage_type:
            profile?.garage_type ??
            null,

        garage_spaces:
            profile?.garage_spaces ??
            null,

        lot_size_acres:
            profile?.lot_size_acres ??
            null,

        onboarding_status:
            profile?.onboarding_status ??
            null,

        onboarding_step:
            profile?.onboarding_step ??
            null,

        metadata:
            profile?.metadata ??
            null,

        profile_created_at:
            profile?.created_at ??
            null,

        profile_updated_at:
            profile?.updated_at ??
            null,
    };
}


// =========================================================
// GET PROFILE TESTS
// =========================================================

describe(
    "GET /api/homes/:homeId/profile",
    () => {
        test(
            "returns 401 without authentication",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        );

                expect(
                    response.status
                ).toBe(401);

                expect(
                    mockPoolQuery
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "returns an empty structured profile for an owned home without a profile record",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/homes/${USER_A_HOME_ID}/profile`
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
                ).toMatchObject({
                    homeId:
                        USER_A_HOME_ID,

                    homeName:
                        "User A House",

                    yearBuilt:
                        1985,

                    propertyType:
                        null,

                    squareFeet:
                        null,

                    onboardingStatus:
                        "not_started",
                });
            }
        );


        test(
            "returns 404 when User B requests User A's profile",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/homes/${USER_A_HOME_ID}/profile`
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

                // Only the ownership query should run.
                expect(
                    mockPoolQuery
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );
    }
);


// =========================================================
// PATCH PROFILE TESTS
// =========================================================

describe(
    "PATCH /api/homes/:homeId/profile",
    () => {
        test(
            "creates a profile for the authenticated owner",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            propertyType:
                                "single_family",

                            squareFeet:
                                1850,

                            bedrooms:
                                3,

                            fullBathrooms:
                                2,

                            stories:
                                2,

                            foundationType:
                                "crawl_space",

                            coolingType:
                                "central_air",

                            onboardingStatus:
                                "in_progress",
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body
                ).toMatchObject({
                    homeId:
                        USER_A_HOME_ID,

                    propertyType:
                        "single_family",

                    squareFeet:
                        1850,

                    bedrooms:
                        3,

                    fullBathrooms:
                        2,

                    stories:
                        2,

                    foundationType:
                        "crawl_space",

                    coolingType:
                        "central_air",

                    onboardingStatus:
                        "in_progress",
                });

                const savedProfile =
                    testDatabase.profiles.find(
                        (profile) =>
                            profile.home_id ===
                            USER_A_HOME_ID
                    );

                expect(
                    savedProfile
                ).toBeDefined();

                expect(
                    savedProfile.square_feet
                ).toBe(1850);
            }
        );


        test(
            "returns 404 before mutation when User B tries to update User A's profile",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        )
                        .set(
                            "x-test-user-id",
                            USER_B_ID
                        )
                        .send({
                            squareFeet:
                                9999,
                        });

                expect(
                    response.status
                ).toBe(404);

                expect(
                    testDatabase.profiles
                ).toHaveLength(0);

                expect(
                    mockPoolQuery
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "rejects unknown fields",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            ownerAuth0Id:
                                USER_B_ID,
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "Home profile validation failed",

                    fields: {
                        ownerAuth0Id:
                            "This field cannot be updated",
                    },
                });

                expect(
                    testDatabase.profiles
                ).toHaveLength(0);
            }
        );


        test(
            "rejects invalid numeric values",
            async () => {
                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            squareFeet:
                                -500,

                            bedrooms:
                                2.5,
                        });

                expect(
                    response.status
                ).toBe(400);

                expect(
                    response.body.error
                ).toBe(
                    "Home profile validation failed"
                );

                expect(
                    response.body.fields
                ).toHaveProperty(
                    "squareFeet"
                );

                expect(
                    response.body.fields
                ).toHaveProperty(
                    "bedrooms"
                );

                expect(
                    testDatabase.profiles
                ).toHaveLength(0);
            }
        );


        test(
            "allows a saved field to be cleared with null",
            async () => {
                testDatabase.profiles.push({
                    id:
                        "33333333-3333-4333-8333-333333333333",

                    home_id:
                        USER_A_HOME_ID,

                    property_type:
                        "single_family",

                    square_feet:
                        1850,

                    bedrooms:
                        3,

                    full_bathrooms:
                        null,

                    half_bathrooms:
                        null,

                    stories:
                        null,

                    foundation_type:
                        null,

                    basement_type:
                        null,

                    exterior_material:
                        null,

                    roof_material:
                        null,

                    heating_type:
                        null,

                    cooling_type:
                        null,

                    water_heater_type:
                        null,

                    water_source:
                        null,

                    sewer_type:
                        null,

                    electrical_service_amps:
                        null,

                    garage_type:
                        null,

                    garage_spaces:
                        null,

                    lot_size_acres:
                        null,

                    onboarding_status:
                        "in_progress",

                    onboarding_step:
                        null,

                    metadata:
                        {},

                    created_at:
                        "2026-07-25T14:00:00.000Z",

                    updated_at:
                        "2026-07-25T14:00:00.000Z",
                });

                const response =
                    await request(app)
                        .patch(
                            `/api/homes/${USER_A_HOME_ID}/profile`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        )
                        .send({
                            squareFeet:
                                null,
                        });

                expect(
                    response.status
                ).toBe(200);

                expect(
                    response.body
                        .squareFeet
                ).toBeNull();

                expect(
                    testDatabase
                        .profiles[0]
                        .square_feet
                ).toBeNull();
            }
        );


        test(
            "rejects clearing onboardingStatus with null or blank string",
            async () => {
                for (const rawValue of [
                    null,
                    "",
                    "   ",
                ]) {
                    const response =
                        await request(app)
                            .patch(
                                `/api/homes/${USER_A_HOME_ID}/profile`
                            )
                            .set(
                                "x-test-user-id",
                                USER_A_ID
                            )
                            .send({
                                onboardingStatus:
                                    rawValue,
                            });

                    expect(
                        response.status
                    ).toBe(400);

                    expect(
                        response.body
                    ).toEqual({
                        error:
                            "Home profile validation failed",

                        fields: {
                            onboardingStatus:
                                "onboardingStatus must be not_started, in_progress, or completed",
                        },
                    });

                    expect(
                        testDatabase.profiles
                    ).toHaveLength(0);
                }
            }
        );
    }
);