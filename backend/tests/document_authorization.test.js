// backend/tests/document-authorization.test.js

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
// These values imitate Auth0 `sub` claims.
//
// They are not real Auth0 accounts and do not require real
// access tokens.
//
const USER_A_ID =
    "auth0|houseiq-document-test-user-a";

const USER_B_ID =
    "auth0|houseiq-document-test-user-b";


// ---------------------------------------------------------
// TEST RESOURCE IDS
// ---------------------------------------------------------
//
// server.js validates document IDs as UUIDs before querying
// CockroachDB. Therefore, every normal test resource must use
// a properly formatted UUID.
//
const USER_A_HOME_ID =
    "11111111-1111-4111-8111-111111111111";

const USER_B_HOME_ID =
    "22222222-2222-4222-8222-222222222222";

const USER_A_DOCUMENT_ID =
    "33333333-3333-4333-8333-333333333333";

const USER_B_DOCUMENT_ID =
    "44444444-4444-4444-8444-444444444444";

const LEGACY_DOCUMENT_ID =
    "55555555-5555-4555-8555-555555555555";


// ---------------------------------------------------------
// HOISTED MOCK FUNCTIONS
// ---------------------------------------------------------
//
// Vitest moves vi.mock() declarations to the top of the file
// before normal JavaScript variables are initialized.
//
// vi.hoisted() guarantees these mock functions already exist
// when the mocked modules are constructed.
//
const {
    mockPoolQuery,
    mockPoolConnect,
    mockClientQuery,
    mockClientRelease,
    mockCreateDocumentDownloadUrl,
    mockDeleteDocumentFromS3,
    mockUploadDocumentToS3,
} = vi.hoisted(() => {
    return {
        mockPoolQuery:
            vi.fn(),

        mockPoolConnect:
            vi.fn(),

        mockClientQuery:
            vi.fn(),

        mockClientRelease:
            vi.fn(),

        mockCreateDocumentDownloadUrl:
            vi.fn(),

        mockDeleteDocumentFromS3:
            vi.fn(),

        mockUploadDocumentToS3:
            vi.fn(),
    };
});


// ---------------------------------------------------------
// IN-MEMORY TEST DATABASE
// ---------------------------------------------------------
//
// This object represents only the database records needed by
// this test suite.
//
// It is recreated before every test so tests remain isolated.
//
let testDatabase;


// ---------------------------------------------------------
// MOCK AUTH0
// ---------------------------------------------------------
//
// Production HouseIQ uses a Bearer access token validated by
// express-oauth2-jwt-bearer.
//
// These tests should not:
//
// - contact Auth0
// - generate real JWTs
// - use signing keys
// - depend on network access
//
// Instead, a test sends:
//
// x-test-user-id: auth0|houseiq-document-test-user-a
//
// The mock places that identity in:
//
// req.auth.payload.sub
//
// That is the same location used by production code.
//
vi.mock("../auth.js", () => {
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
                    sub:
                        testUserId,
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
// MOCK THE DATABASE MODULE
// ---------------------------------------------------------
//
// server.js imports:
//
// import { pool } from "./db.js";
//
// This replacement prevents the test from connecting to the
// real CockroachDB cluster.
//
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
// MOCK S3
// ---------------------------------------------------------
//
// No test should create:
//
// - a real S3 object
// - a real signed URL
// - a real deletion
//
// More importantly, the mocks let us prove that forbidden
// users never reach an S3 operation.
//
vi.mock("../s3.js", () => {
    return {
        createDocumentDownloadUrl:
            mockCreateDocumentDownloadUrl,

        deleteDocumentFromS3:
            mockDeleteDocumentFromS3,

        uploadDocumentToS3:
            mockUploadDocumentToS3,
    };
});


// ---------------------------------------------------------
// MOCK AI
// ---------------------------------------------------------
//
// Importing server.js also imports its AI functions.
//
// The download and deletion tests do not use AI, but mocking
// the module keeps this test completely isolated from OpenAI.
//
vi.mock("../ai.js", () => {
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
                    "Test response",

                confidence:
                    1,

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
            })),

        analyzeHomeDocument:
            vi.fn(async () => ({
                summary:
                    "Test summary",

                documentDate:
                    null,

                contractorOrCompany:
                    null,

                memoriesToCreate:
                    [],

                issuesToCreate:
                    [],

                projectsToCreate:
                    [],

                assetsToCreate:
                    [],
            })),
    };
});


// ---------------------------------------------------------
// IMPORT THE EXPRESS APPLICATION
// ---------------------------------------------------------
//
// server.js must export:
//
// export { app };
//
// It must also avoid app.listen() while NODE_ENV is "test".
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
// RESET ALL TEST STATE
// ---------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();


    // -----------------------------------------------------
    // RESET FAKE DATABASE RECORDS
    // -----------------------------------------------------

    testDatabase = {
        homes: [
            {
                id:
                    USER_A_HOME_ID,

                owner_auth0_id:
                    USER_A_ID,

                name:
                    "User A House",
            },

            {
                id:
                    USER_B_HOME_ID,

                owner_auth0_id:
                    USER_B_ID,

                name:
                    "User B House",
            },
        ],

        documents: [
            {
                id:
                    USER_A_DOCUMENT_ID,

                home_id:
                    USER_A_HOME_ID,

                document_type:
                    "inspection",

                file_name:
                    "user-a-inspection.pdf",

                source_url:
                    "s3://houseiq-test-bucket/homes/user-a/inspection.pdf",

                metadata: {
                    storageProvider:
                        "aws_s3",

                    s3Bucket:
                        "houseiq-test-bucket",

                    s3Key:
                        "homes/user-a/inspection.pdf",

                    mimeType:
                        "application/pdf",
                },

                created_at:
                    "2026-07-24T10:00:00.000Z",

                updated_at:
                    "2026-07-24T10:00:00.000Z",
            },

            {
                id:
                    USER_B_DOCUMENT_ID,

                home_id:
                    USER_B_HOME_ID,

                document_type:
                    "invoice",

                file_name:
                    "user-b-invoice.txt",

                source_url:
                    "s3://houseiq-test-bucket/homes/user-b/invoice.txt",

                metadata: {
                    storageProvider:
                        "aws_s3",

                    s3Bucket:
                        "houseiq-test-bucket",

                    s3Key:
                        "homes/user-b/invoice.txt",

                    mimeType:
                        "text/plain",
                },

                created_at:
                    "2026-07-24T11:00:00.000Z",

                updated_at:
                    "2026-07-24T11:00:00.000Z",
            },

            // This simulates a document created before HouseIQ
            // stored original files in S3.
            {
                id:
                    LEGACY_DOCUMENT_ID,

                home_id:
                    USER_A_HOME_ID,

                document_type:
                    "manual",

                file_name:
                    "old-water-heater-manual.pdf",

                source_url:
                    null,

                metadata: {},

                created_at:
                    "2026-01-01T12:00:00.000Z",

                updated_at:
                    "2026-01-01T12:00:00.000Z",
            },
        ],
    };


    // -----------------------------------------------------
    // DEFAULT SIGNED-URL RESULT
    // -----------------------------------------------------
    //
    // The real S3 helper returns an object, not merely a URL
    // string.
    //

    mockCreateDocumentDownloadUrl
        .mockResolvedValue({
            url:
                "https://example.test/signed-document-url",

            expiresInSeconds:
                300,
        });


    // -----------------------------------------------------
    // DEFAULT S3 DELETE RESULT
    // -----------------------------------------------------

    mockDeleteDocumentFromS3
        .mockResolvedValue({
            deleted:
                true,
        });


    // -----------------------------------------------------
    // FAKE DATABASE CONNECTION
    // -----------------------------------------------------

    mockPoolConnect
        .mockResolvedValue({
            query:
                mockClientQuery,

            release:
                mockClientRelease,
        });


    // -----------------------------------------------------
    // POOL QUERY IMPLEMENTATION
    // -----------------------------------------------------
    //
    // requireDocumentOwnership uses pool.query directly.
    //

    mockPoolQuery.mockImplementation(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                normalizeSql(sql);


            // -------------------------------------------------
            // DOCUMENT OWNERSHIP QUERY
            // -------------------------------------------------
            //
            // Production performs:
            //
            // documents
            //     INNER JOIN homes
            //         ON homes.id = documents.home_id
            //
            // and then checks:
            //
            // documents.id = requested document
            // homes.owner_auth0_id = authenticated user
            //

            if (
                normalizedSql.includes(
                    "from documents"
                ) &&
                normalizedSql.includes(
                    "inner join homes"
                ) &&
                normalizedSql.includes(
                    "where documents.id = $1"
                ) &&
                normalizedSql.includes(
                    "and homes.owner_auth0_id = $2"
                )
            ) {
                const [
                    documentId,
                    ownerAuth0Id,
                ] = parameters;

                const document =
                    testDatabase.documents.find(
                        (candidate) =>
                            candidate.id ===
                            documentId
                    );

                if (!document) {
                    return {
                        rows:
                            [],

                        rowCount:
                            0,
                    };
                }

                const parentHome =
                    testDatabase.homes.find(
                        (home) =>
                            home.id ===
                            document.home_id
                    );

                const userOwnsDocument =
                    parentHome?.owner_auth0_id ===
                    ownerAuth0Id;

                if (!userOwnsDocument) {
                    return {
                        rows:
                            [],

                        rowCount:
                            0,
                    };
                }

                return {
                    rows: [
                        {
                            ...document,
                        },
                    ],

                    rowCount:
                        1,
                };
            }


            throw new Error(
                [
                    "The document authorization test received",
                    "an unexpected pool.query SQL statement:",
                    normalizedSql,
                ].join("\n")
            );
        }
    );


    // -----------------------------------------------------
    // TRANSACTION QUERY IMPLEMENTATION
    // -----------------------------------------------------
    //
    // The DELETE route obtains a dedicated connection with:
    //
    // const client = await pool.connect()
    //
    // It then runs:
    //
    // BEGIN
    // DELETE FROM documents...
    // COMMIT
    //

    mockClientQuery.mockImplementation(
        async (
            sql,
            parameters = []
        ) => {
            const normalizedSql =
                normalizeSql(sql);


            // Transaction control statements do not return rows.
            if (
                normalizedSql ===
                "begin" ||
                normalizedSql ===
                "commit" ||
                normalizedSql ===
                "rollback"
            ) {
                return {
                    rows:
                        [],

                    rowCount:
                        0,
                };
            }


            // -------------------------------------------------
            // DELETE AUTHORIZED DOCUMENT RECORD
            // -------------------------------------------------

            if (
                normalizedSql.includes(
                    "delete from documents"
                ) &&
                normalizedSql.includes(
                    "where id = $1"
                ) &&
                normalizedSql.includes(
                    "and home_id = $2"
                )
            ) {
                const [
                    documentId,
                    homeId,
                ] = parameters;

                const documentIndex =
                    testDatabase.documents.findIndex(
                        (document) =>
                            document.id ===
                            documentId &&
                            document.home_id ===
                            homeId
                    );

                if (
                    documentIndex ===
                    -1
                ) {
                    return {
                        rows:
                            [],

                        rowCount:
                            0,
                    };
                }

                const [
                    deletedDocument,
                ] =
                    testDatabase.documents.splice(
                        documentIndex,
                        1
                    );

                return {
                    rows: [
                        {
                            id:
                                deletedDocument.id,

                            file_name:
                                deletedDocument.file_name,
                        },
                    ],

                    rowCount:
                        1,
                };
            }


            throw new Error(
                [
                    "The document authorization test received",
                    "an unexpected transaction SQL statement:",
                    normalizedSql,
                ].join("\n")
            );
        }
    );
});


// ---------------------------------------------------------
// SQL NORMALIZATION HELPER
// ---------------------------------------------------------
//
// SQL formatting should not determine whether a test passes.
//
// This converts:
//
// SELECT
//     id
// FROM documents
//
// into:
//
// select id from documents
//
function normalizeSql(sql) {
    return sql
        .replace(
            /\s+/g,
            " "
        )
        .trim()
        .toLowerCase();
}


// ---------------------------------------------------------
// TEST HELPER
// ---------------------------------------------------------
//
// This checks whether a document still exists in our fake
// database after a request.
//
function documentExists(
    documentId
) {
    return testDatabase.documents.some(
        (document) =>
            document.id ===
            documentId
    );
}


// =========================================================
// DOWNLOAD URL AUTHORIZATION TESTS
// =========================================================

describe(
    "GET /api/documents/:documentId/download-url",
    () => {
        test(
            "returns 401 when the request is unauthenticated",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/documents/${USER_A_DOCUMENT_ID}/download-url`
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

                // Authentication must stop the request before
                // ownership, database, or S3 work begins.
                expect(
                    mockPoolQuery
                ).not.toHaveBeenCalled();

                expect(
                    mockCreateDocumentDownloadUrl
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "allows User A to generate a signed URL for User A's document",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/documents/${USER_A_DOCUMENT_ID}/download-url`
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
                    documentId:
                        USER_A_DOCUMENT_ID,

                    fileName:
                        "user-a-inspection.pdf",

                    url:
                        "https://example.test/signed-document-url",

                    expiresInSeconds:
                        300,
                });

                // Verify that the private S3 key from the
                // authorized record was used.
                expect(
                    mockCreateDocumentDownloadUrl
                ).toHaveBeenCalledTimes(
                    1
                );

                expect(
                    mockCreateDocumentDownloadUrl
                ).toHaveBeenCalledWith({
                    key:
                        "homes/user-a/inspection.pdf",

                    originalFileName:
                        "user-a-inspection.pdf",

                    expiresInSeconds:
                        300,
                });
            }
        );


        test(
            "returns 404 when User B requests User A's document",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/documents/${USER_A_DOCUMENT_ID}/download-url`
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
                        "Document not found",
                });

                // This is the critical security assertion.
                //
                // A non-owner must never receive any signed URL.
                expect(
                    mockCreateDocumentDownloadUrl
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "returns 400 for a malformed document UUID before querying the database",
            async () => {
                const response =
                    await request(app)
                        .get(
                            "/api/documents/not-a-valid-uuid/download-url"
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
                        "A valid document ID is required",
                });

                expect(
                    mockPoolQuery
                ).not.toHaveBeenCalled();

                expect(
                    mockCreateDocumentDownloadUrl
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "returns 409 when an authorized legacy document has no S3 key",
            async () => {
                const response =
                    await request(app)
                        .get(
                            `/api/documents/${LEGACY_DOCUMENT_ID}/download-url`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(409);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "The original file is not available",

                    details:
                        "This document was created before S3 storage was enabled.",
                });

                expect(
                    mockCreateDocumentDownloadUrl
                ).not.toHaveBeenCalled();
            }
        );
    }
);


// =========================================================
// DOCUMENT DELETION AUTHORIZATION TESTS
// =========================================================

describe(
    "DELETE /api/documents/:documentId",
    () => {
        test(
            "returns 401 when the delete request is unauthenticated",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/documents/${USER_A_DOCUMENT_ID}`
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

                expect(
                    mockPoolQuery
                ).not.toHaveBeenCalled();

                expect(
                    mockDeleteDocumentFromS3
                ).not.toHaveBeenCalled();

                expect(
                    mockPoolConnect
                ).not.toHaveBeenCalled();

                expect(
                    documentExists(
                        USER_A_DOCUMENT_ID
                    )
                ).toBe(true);
            }
        );


        test(
            "allows User A to delete User A's S3 object and document record",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/documents/${USER_A_DOCUMENT_ID}`
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
                    message:
                        "Document deleted successfully",

                    documentId:
                        USER_A_DOCUMENT_ID,

                    fileName:
                        "user-a-inspection.pdf",
                });


                // Confirm the exact authorized S3 key was deleted.
                expect(
                    mockDeleteDocumentFromS3
                ).toHaveBeenCalledTimes(
                    1
                );

                expect(
                    mockDeleteDocumentFromS3
                ).toHaveBeenCalledWith({
                    key:
                        "homes/user-a/inspection.pdf",
                });


                // Confirm a dedicated transaction connection
                // was used.
                expect(
                    mockPoolConnect
                ).toHaveBeenCalledTimes(
                    1
                );


                // Confirm transaction order.
                expect(
                    mockClientQuery
                ).toHaveBeenNthCalledWith(
                    1,
                    "BEGIN"
                );

                expect(
                    normalizeSql(
                        mockClientQuery.mock.calls[1][0]
                    )
                ).toContain(
                    "delete from documents"
                );

                expect(
                    mockClientQuery.mock.calls[1][1]
                ).toEqual([
                    USER_A_DOCUMENT_ID,
                    USER_A_HOME_ID,
                ]);

                expect(
                    mockClientQuery
                ).toHaveBeenNthCalledWith(
                    3,
                    "COMMIT"
                );


                // Confirm the record was actually removed from
                // the fake database.
                expect(
                    documentExists(
                        USER_A_DOCUMENT_ID
                    )
                ).toBe(false);


                // Confirm the connection was returned to the pool.
                expect(
                    mockClientRelease
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "returns 404 when User B tries to delete User A's document",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/documents/${USER_A_DOCUMENT_ID}`
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
                        "Document not found",
                });


                // The request must stop in ownership middleware.
                expect(
                    mockDeleteDocumentFromS3
                ).not.toHaveBeenCalled();

                expect(
                    mockPoolConnect
                ).not.toHaveBeenCalled();

                expect(
                    mockClientQuery
                ).not.toHaveBeenCalled();


                // The document record must remain untouched.
                expect(
                    documentExists(
                        USER_A_DOCUMENT_ID
                    )
                ).toBe(true);
            }
        );


        test(
            "deletes a legacy database record without attempting an S3 deletion",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            `/api/documents/${LEGACY_DOCUMENT_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(200);

                expect(
                    mockDeleteDocumentFromS3
                ).not.toHaveBeenCalled();

                expect(
                    documentExists(
                        LEGACY_DOCUMENT_ID
                    )
                ).toBe(false);

                expect(
                    mockClientQuery
                ).toHaveBeenNthCalledWith(
                    3,
                    "COMMIT"
                );

                expect(
                    mockClientRelease
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "returns 400 for a malformed delete ID without touching S3 or the database",
            async () => {
                const response =
                    await request(app)
                        .delete(
                            "/api/documents/not-a-valid-uuid"
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
                        "A valid document ID is required",
                });

                expect(
                    mockPoolQuery
                ).not.toHaveBeenCalled();

                expect(
                    mockDeleteDocumentFromS3
                ).not.toHaveBeenCalled();

                expect(
                    mockPoolConnect
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "does not delete the database record when S3 deletion fails",
            async () => {
                mockDeleteDocumentFromS3
                    .mockRejectedValueOnce(
                        new Error(
                            "Simulated S3 deletion failure"
                        )
                    );

                const response =
                    await request(app)
                        .delete(
                            `/api/documents/${USER_A_DOCUMENT_ID}`
                        )
                        .set(
                            "x-test-user-id",
                            USER_A_ID
                        );

                expect(
                    response.status
                ).toBe(500);

                expect(
                    response.body
                ).toEqual({
                    error:
                        "Document could not be deleted",
                });


                // The route deletes from S3 before opening the
                // CockroachDB transaction. Therefore an S3
                // failure must prevent all database mutation.
                expect(
                    mockPoolConnect
                ).not.toHaveBeenCalled();

                expect(
                    mockClientQuery
                ).not.toHaveBeenCalled();

                expect(
                    documentExists(
                        USER_A_DOCUMENT_ID
                    )
                ).toBe(true);
            }
        );
    }
);