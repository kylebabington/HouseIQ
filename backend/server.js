// backend/server.js

// Loads variables from .env into process.env
import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";

// Express creates our API server
import express from "express";

// CORS allows the frontend to talk to the backend
import cors from "cors";

// pg lets Node connect to PostgreSQL-compatible databases like CockroachDB
import pg from "pg";

// Multer handles uploaded files sent as multipart/form-data.
import multer from "multer";

// pdf-parse extracts text from normal text-based PDF files.
// Import the lib entry directly — the package root runs a debug harness
// when loaded via ESM (module.parent is unset), which crashes without test PDFs.
import pdf from "pdf-parse/lib/pdf-parse.js";

import { createDocumentDownloadUrl, deleteDocumentFromS3, uploadDocumentToS3 } from "./s3.js";

// AI functions
import { createEmbedding, vectorToSql, generateHouseAgentResponse, analyzeHomeDocument } from "./ai.js";

import {
    UnauthorizedError,
} from "express-oauth2-jwt-bearer";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "./auth.js";

const { Pool } = pg;

const app = express();

app.use(
    cors({
        // Only allow requests from the HouseIQ frontend.
        origin:
            process.env.FRONTEND_URL ||
            "http://localhost:5173",

        // These are the HTTP methods currently used by HouseIQ.
        methods: [
            "GET",
            "POST",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],

        // Authenticated API calls require Authorization.
        allowedHeaders: [
            "Content-Type",
            "Authorization",
        ],
    })
);

app.use(express.json());

// ---------------------------------------------------------
// FILE UPLOAD CONFIGURATION
// ---------------------------------------------------------

// memoryStorage keeps the uploaded file in RAM temporarily.
//
// That means:
// - no temporary files are written to your computer
// - req.file.buffer contains the file bytes
// - the file disappears when the request finishes
//
// This is appropriate for the MVP, but not permanent storage.
const uploadStorage = multer.memoryStorage();

const upload = multer({
    storage: uploadStorage,

    limits: {
        // Reject files larger than 10 MB.
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
            "application/pdf",
            "text/plain",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return callback(
                new Error(
                    "Only PDF and plain-text files are currently supported"
                )
            );
        }

        callback(null, true);
    },
});

// Create one reusable database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false,
    },
});

// ---------------------------------------------------------
// HOME OWNERSHIP AUTHORIZATION
// ---------------------------------------------------------
//
// Authentication answers:
//
// "Who is making this request?"
//
// This middleware answers:
//
// "Does that authenticated user own the requested home?"
//
// It must run only after requireAuth, because it depends on
// req.auth.payload.sub being available.
//
async function requireHomeOwnership(
    req,
    res,
    next
) {
    try {
        // All home-specific routes use the parameter name:
        //
        // :homeId
        //
        // Example:
        //
        // /api/homes/123/memories
        //
        const { homeId } = req.params;

        if (!homeId) {
            return res.status(400).json({
                error:
                    "Home ID is required",
            });
        }

        // Read the stable Auth0 user ID from the access token.
        //
        // requireAuth must run before this middleware.
        //
        const ownerAuth0Id =
            getAuthenticatedUserId(req);

        // Find a home only when both conditions are true:
        //
        // 1. The home ID matches the requested URL.
        // 2. The home belongs to the authenticated Auth0 user.
        //
        const result =
            await pool.query(
                `
                SELECT
                    id,
                    owner_auth0_id
                FROM homes
                WHERE id = $1
                  AND owner_auth0_id = $2
                LIMIT 1
                `,
                [
                    homeId,
                    ownerAuth0Id,
                ]
            );

        // Return 404 whether the home does not exist or belongs
        // to another user.
        //
        // We intentionally do not return 403 here because that
        // would reveal that another user's home exists.
        //
        if (result.rows.length === 0) {
            return res.status(404).json({
                error:
                    "Home not found",
            });
        }

        // Store the verified home ID on the request.
        //
        // Route handlers can continue using req.params.homeId,
        // but this gives us a trusted authorization result for
        // future middleware and controllers.
        //
        req.authorizedHomeId =
            result.rows[0].id;

        // Continue to the actual route handler.
        return next();
    } catch (error) {
        console.error(
            "Home ownership check failed:",
            error
        );

        return res.status(500).json({
            error:
                "Could not verify home access",
        });
    }
}

// ---------------------------------------------------------
// DATABASE RECORD HELPERS
// ---------------------------------------------------------

// ---------------------------------------------------------
// DOCUMENT TEXT EXTRACTION
// ---------------------------------------------------------

/**
 * Extracts readable text from an uploaded PDF or text file.
 *
 * Supported MIME types:
 *
 * - application/pdf
 * - text/plain
 */
async function extractTextFromUploadedFile(file) {
    if (!file) {
        throw new Error("An uploaded file is required");
    }

    if (!file.buffer) {
        throw new Error(
            "The uploaded file does not contain readable file data"
        );
    }

    if (file.mimetype === "text/plain") {
        const text = file.buffer.toString("utf-8").trim();

        if (!text) {
            throw new Error(
                "The uploaded text file is empty"
            );
        }

        return text;
    }

    if (file.mimetype === "application/pdf") {
        const parsedPdf = await pdf(file.buffer);

        const text = parsedPdf.text?.trim();

        if (!text) {
            throw new Error(
                "No readable text could be extracted from this PDF. It may be a scanned image PDF."
            );
        }

        return text;
    }

    throw new Error(
        `Unsupported file type: ${file.mimetype}`
    );
}
/**
 * Creates a permanent memory and its vector embedding.
 *
 * The optional `client` argument lets this function participate
 * in a database transaction.
 *
 * If no client is supplied, it uses the normal connection pool.
 */
async function createMemoryRecord({
    homeId,
    title,
    category,
    content,
    importance = 3,
    assetId = null,
    metadata = {},
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create a memory");
    }

    if (!content || !content.trim()) {
        throw new Error("Memory content is required");
    }

    const safeTitle =
        title?.trim() || "Untitled memory";

    const safeCategory =
        category?.trim() || "general";

    const safeImportance =
        Number.isInteger(importance)
            ? Math.min(Math.max(importance, 1), 5)
            : 3;

    // Include the title, category, and metadata in the embedded text.
    // This produces better semantic searches than embedding only content.
    const memoryTextForEmbedding = `
Title: ${safeTitle}
Category: ${safeCategory}
Content: ${content.trim()}
Metadata: ${JSON.stringify(metadata)}
`;

    const embedding =
        await createEmbedding(memoryTextForEmbedding);

    const embeddingSql =
        vectorToSql(embedding);

    const result = await client.query(
        `
        INSERT INTO memories (
            home_id,
            asset_id,
            title,
            category,
            content,
            metadata,
            embedding,
            importance
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::JSONB,
            $7::VECTOR(1536),
            $8
        )
        RETURNING
            id,
            home_id,
            asset_id,
            title,
            category,
            content,
            metadata,
            importance,
            created_at,
            updated_at
        `,
        [
            homeId,
            assetId,
            safeTitle,
            safeCategory,
            content.trim(),
            JSON.stringify(metadata),
            embeddingSql,
            safeImportance,
        ]
    );

    return result.rows[0];
}


/**
 * Creates an unresolved home issue.
 */
async function createIssueRecord({
    homeId,
    title,
    description,
    priority = "medium",
    category = "general",
    suspectedCause = "",
    recommendedNextStep = "",
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create an issue");
    }

    if (!title?.trim()) {
        throw new Error("Issue title is required");
    }

    const result = await client.query(
        `
        INSERT INTO home_issues (
            home_id,
            title,
            description,
            status,
            priority,
            category,
            suspected_cause,
            recommended_next_step
        )
        VALUES (
            $1,
            $2,
            $3,
            'open',
            $4,
            $5,
            $6,
            $7
        )
        RETURNING *
        `,
        [
            homeId,
            title.trim(),
            description?.trim() || "",
            priority || "medium",
            category || "general",
            suspectedCause?.trim() || "",
            recommendedNextStep?.trim() || "",
        ]
    );

    return result.rows[0];
}


/**
 * Creates a project and then creates its individual tasks.
 */
async function createProjectRecord({
    homeId,
    title,
    description,
    priority = "medium",
    estimatedCostLow = 0,
    estimatedCostHigh = 0,
    diyDifficulty = "unknown",
    safetyNotes = "",
    tasks = [],
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create a project");
    }

    if (!title?.trim()) {
        throw new Error("Project title is required");
    }

    const projectResult = await client.query(
        `
        INSERT INTO home_projects (
            home_id,
            title,
            description,
            status,
            priority,
            estimated_cost_low,
            estimated_cost_high,
            diy_difficulty,
            safety_notes
        )
        VALUES (
            $1,
            $2,
            $3,
            'planned',
            $4,
            $5,
            $6,
            $7,
            $8
        )
        RETURNING *
        `,
        [
            homeId,
            title.trim(),
            description?.trim() || "",
            priority || "medium",
            estimatedCostLow ?? 0,
            estimatedCostHigh ?? 0,
            diyDifficulty || "unknown",
            safetyNotes?.trim() || "",
        ]
    );

    const project = projectResult.rows[0];

    const createdTasks = [];

    // Create every task in the order supplied by the AI.
    for (let index = 0; index < tasks.length; index += 1) {
        const taskTitle = tasks[index];

        if (
            typeof taskTitle !== "string" ||
            !taskTitle.trim()
        ) {
            continue;
        }

        const taskResult = await client.query(
            `
            INSERT INTO project_tasks (
                project_id,
                title,
                status,
                task_order
            )
            VALUES (
                $1,
                $2,
                'todo',
                $3
            )
            RETURNING *
            `,
            [
                project.id,
                taskTitle.trim(),
                index + 1,
            ]
        );

        createdTasks.push(taskResult.rows[0]);
    }

    return {
        ...project,
        tasks: createdTasks,
    };
}


/**
 * Creates a physical home asset.
 *
 * We intentionally insert only the core fields that are clearly
 * identified by the agent.
 */
async function createAssetRecord({
    homeId,
    assetType,
    name,
    brand = "",
    model = "",
    serialNumber = "",
    location = "",
    notes = "",
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create an asset");
    }

    if (!assetType?.trim()) {
        throw new Error("Asset type is required");
    }

    if (!name?.trim()) {
        throw new Error("Asset name is required");
    }

    const result = await client.query(
        `
        INSERT INTO home_assets (
            home_id,
            asset_type,
            name,
            brand,
            model,
            serial_number,
            location,
            notes
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
        )
        RETURNING *
        `,
        [
            homeId,
            assetType.trim(),
            name.trim(),
            brand?.trim() || "",
            model?.trim() || "",
            serialNumber?.trim() || "",
            location?.trim() || "",
            notes?.trim() || "",
        ]
    );

    return result.rows[0];
}


// ---------------------------------------------------------
// SIMPLE HEALTH CHECK
// ---------------------------------------------------------
//
// This route is public.
//
// It lets us confirm that the Express server is running
// without requiring an Auth0 access token.
//
app.get("/", (req, res) => {
    res.json({
        message:
            "HouseIQ backend is running",
    });
});


// ---------------------------------------------------------
// CURRENT AUTHENTICATED USER
// ---------------------------------------------------------
//
// This route is protected by Auth0.
//
// The request must contain:
//
// Authorization: Bearer ACCESS_TOKEN
//
// If the token is missing or invalid, requireAuth returns
// a 401 response before the route handler runs.
//
app.get(
    "/api/auth/me",

    // Auth0 validates the access token before continuing.
    requireAuth,

    (req, res) => {
        // Auth0 places the logged-in user's stable ID
        // inside the token's `sub` claim.
        //
        // getAuthenticatedUserId() reads that claim.
        const auth0UserId =
            getAuthenticatedUserId(
                req
            );

        return res.json({
            authenticated:
                true,

            auth0UserId,

            // Email and name may not be included in an
            // API access token. Null is acceptable here.
            email:
                req.auth.payload.email ||
                null,

            name:
                req.auth.payload.name ||
                null,

            // Returning all claims is useful for this
            // temporary authentication test.
            //
            // We can remove this later.
            claims:
                req.auth.payload,
        });
    }
);


// ---------------------------------------------------------
// TEST DATABASE CONNECTION
// ---------------------------------------------------------
//
// This route is still public for now.
//
app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT now() AS current_time;");

        res.json({
            message: "Connected to CockroachDB Cloud",
            currentTime: result.rows[0].current_time,
        });
    } catch (error) {
        console.error("Database test failed:", error);

        res.status(500).json({
            error: "Database connection failed",
            details: error.message,
        });
    }
});

// Create a new home owned by the authenticated Auth0 user.
app.post(
    "/api/homes",
    requireAuth,
    async (req, res) => {
        try {
            const { name, yearBuilt, notes } = req.body;

            if (!name) {
                return res.status(400).json({
                    error: "Home name is required",
                });
            }

            const ownerAuth0Id =
                getAuthenticatedUserId(req);

            const result = await pool.query(
                `
      INSERT INTO homes (
        owner_auth0_id,
        name,
        year_built,
        notes
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
                [
                    ownerAuth0Id,
                    name,
                    yearBuilt || null,
                    notes || "",
                ]
            );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error("Error creating home:", error);
            res.status(500).json({
                error: "Failed to create home",
            });
        }
    }
);

// Get homes owned by the authenticated Auth0 user.
app.get(
    "/api/homes",
    requireAuth,
    async (req, res) => {
        try {
            const ownerAuth0Id =
                getAuthenticatedUserId(req);

            const result = await pool.query(
                `
      SELECT *
      FROM homes
      WHERE owner_auth0_id = $1
      ORDER BY created_at DESC
      `,
                [ownerAuth0Id]
            );

            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching homes:", error);
            res.status(500).json({
                error: "Failed to fetch homes",
            });
        }
    }
);

// Add a memory to a home manually.
//
// Authentication confirms who the user is.
// Home ownership confirms that the requested home belongs
// to that authenticated user.
//
app.post(
    "/api/homes/:homeId/memories",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const {
                title,
                category,
                content,
                assetId,
                metadata,
                importance,
            } = req.body;

            if (!content) {
                return res.status(400).json({
                    error:
                        "Memory content is required",
                });
            }

            const memory =
                await createMemoryRecord({
                    homeId,
                    assetId:
                        assetId || null,
                    title:
                        title ||
                        "Untitled memory",
                    category:
                        category ||
                        "general",
                    content,
                    metadata:
                        metadata || {},
                    importance:
                        importance || 3,
                });

            return res
                .status(201)
                .json(memory);
        } catch (error) {
            console.error(
                "Error creating memory:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to create memory",
                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// GET MEMORIES FOR ONE OWNED HOME
// ---------------------------------------------------------

app.get(
    "/api/homes/:homeId/memories",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM memories
                    WHERE home_id = $1
                    ORDER BY created_at DESC
                    `,
                    [
                        homeId,
                    ]
                );

            return res.json(
                result.rows
            );
        } catch (error) {
            console.error(
                "Error fetching memories:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch memories",
            });
        }
    }
);

// ---------------------------------------------------------
// SEMANTIC MEMORY SEARCH FOR ONE OWNED HOME
// ---------------------------------------------------------

app.post(
    "/api/homes/:homeId/memory-search",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const { query } =
                req.body;

            const safeQuery =
                typeof query === "string"
                    ? query.trim()
                    : "";

            if (!safeQuery) {
                return res.status(400).json({
                    error:
                        "Search query is required",
                });
            }

            const queryEmbedding =
                await createEmbedding(
                    safeQuery
                );

            const queryVectorSql =
                vectorToSql(
                    queryEmbedding
                );

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        title,
                        category,
                        content,
                        metadata,
                        importance,
                        created_at,

                        embedding <=>
                            $2::VECTOR(1536)
                            AS similarity_distance

                    FROM memories
                    WHERE home_id = $1
                      AND embedding IS NOT NULL

                    ORDER BY
                        embedding <=>
                        $2::VECTOR(1536)

                    LIMIT 5
                    `,
                    [
                        homeId,
                        queryVectorSql,
                    ]
                );

            return res.json({
                query:
                    safeQuery,
                results:
                    result.rows,
            });
        } catch (error) {
            console.error(
                "Memory search failed:",
                error
            );

            return res.status(500).json({
                error:
                    "Memory search failed",
                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// GET ISSUES FOR ONE OWNED HOME
// ---------------------------------------------------------

app.get(
    "/api/homes/:homeId/issues",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM home_issues
                    WHERE home_id = $1
                    ORDER BY
                        CASE priority
                            WHEN 'urgent' THEN 1
                            WHEN 'high' THEN 2
                            WHEN 'medium' THEN 3
                            WHEN 'low' THEN 4
                            ELSE 5
                        END,
                        created_at DESC
                    `,
                    [
                        homeId,
                    ]
                );

            return res.json(
                result.rows
            );
        } catch (error) {
            console.error(
                "Error fetching home issues:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch home issues",
                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// GET PROJECTS FOR ONE OWNED HOME
// ---------------------------------------------------------
//
// Project tasks do not contain home_id directly.
//
// Ownership is still protected because:
//
// 1. The middleware verifies the home.
// 2. Projects are loaded only from that verified home.
// 3. Tasks are loaded only for those returned project IDs.
//
app.get(
    "/api/homes/:homeId/projects",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const projectsResult =
                await pool.query(
                    `
                    SELECT *
                    FROM home_projects
                    WHERE home_id = $1
                    ORDER BY created_at DESC
                    `,
                    [
                        homeId,
                    ]
                );

            const projects =
                projectsResult.rows;

            if (projects.length === 0) {
                return res.json([]);
            }

            const projectIds =
                projects.map(
                    (project) =>
                        project.id
                );

            const tasksResult =
                await pool.query(
                    `
                    SELECT *
                    FROM project_tasks
                    WHERE project_id =
                        ANY($1::UUID[])
                    ORDER BY
                        project_id,
                        task_order ASC
                    `,
                    [
                        projectIds,
                    ]
                );

            const tasks =
                tasksResult.rows;

            const projectsWithTasks =
                projects.map(
                    (project) => {
                        return {
                            ...project,

                            tasks:
                                tasks.filter(
                                    (task) =>
                                        task.project_id ===
                                        project.id
                                ),
                        };
                    }
                );

            return res.json(
                projectsWithTasks
            );
        } catch (error) {
            console.error(
                "Error fetching home projects:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch home projects",
                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// GET ASSETS FOR ONE OWNED HOME
// ---------------------------------------------------------

app.get(
    "/api/homes/:homeId/assets",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM home_assets
                    WHERE home_id = $1
                    ORDER BY created_at DESC
                    `,
                    [
                        homeId,
                    ]
                );

            return res.json(
                result.rows
            );
        } catch (error) {
            console.error(
                "Error fetching home assets:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch home assets",
                details:
                    error.message,
            });
        }
    }
);

// Ask HouseIQ a question.
// This is now the main agent endpoint.
//
// It can:
// - retrieve relevant memories
// - answer the user
// - create new memories
// - create issues
// - create projects
// - create assets

// ---------------------------------------------------------
// GET DOCUMENTS FOR ONE OWNED HOME
// ---------------------------------------------------------

app.get(
    "/api/homes/:homeId/documents",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const { homeId } =
                req.params;

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        home_id,
                        document_type,
                        file_name,
                        source_url,
                        summary,
                        metadata,
                        created_at,
                        updated_at
                    FROM documents
                    WHERE home_id = $1
                    ORDER BY created_at DESC
                    `,
                    [
                        homeId,
                    ]
                );

            return res.json(
                result.rows
            );
        } catch (error) {
            console.error(
                "Error fetching documents:",
                error
            );

            return res.status(500).json({
                error:
                    "Failed to fetch documents",
                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// CREATE A TEMPORARY DOCUMENT DOWNLOAD URL
// ---------------------------------------------------------
//
// The original file remains private in S3.
//
// This route creates a temporary URL that allows the browser
// to open one specific document for five minutes.
//
app.get(
    "/api/documents/:documentId/download-url",

    async (req, res) => {
        try {
            const { documentId } =
                req.params;


            // -------------------------------------------------
            // 1. FIND THE DOCUMENT
            // -------------------------------------------------

            const documentResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        home_id,
                        file_name,
                        source_url,
                        metadata
                    FROM documents
                    WHERE id = $1
                    `,
                    [documentId]
                );

            if (
                documentResult.rows.length === 0
            ) {
                return res.status(404).json({
                    error:
                        "Document not found",
                });
            }

            const document =
                documentResult.rows[0];

            const metadata =
                document.metadata || {};


            // -------------------------------------------------
            // 2. GET THE S3 OBJECT KEY
            // -------------------------------------------------

            const s3Key =
                metadata.s3Key;

            if (!s3Key) {
                return res.status(409).json({
                    error:
                        "The original file is not available",

                    details:
                        "This document was created before S3 storage was enabled.",
                });
            }


            // -------------------------------------------------
            // 3. ASK AWS FOR A FIVE-MINUTE URL
            // -------------------------------------------------

            const signedDownload =
                await createDocumentDownloadUrl({
                    key:
                        s3Key,

                    originalFileName:
                        document.file_name,

                    expiresInSeconds:
                        300,
                });


            // -------------------------------------------------
            // 4. RETURN THE TEMPORARY URL
            // -------------------------------------------------

            return res.json({
                documentId:
                    document.id,

                fileName:
                    document.file_name,

                url:
                    signedDownload.url,

                expiresInSeconds:
                    signedDownload
                        .expiresInSeconds,
            });
        } catch (error) {
            console.error(
                "Could not create document download URL:",
                error
            );

            return res.status(500).json({
                error:
                    "Could not open the original document",

                details:
                    error.message,
            });
        }
    }
);

// ---------------------------------------------------------
// DELETE A DOCUMENT AND ITS ORIGINAL S3 OBJECT
// ---------------------------------------------------------

app.delete(
    "/api/documents/:documentId",

    async (req, res) => {
        const { documentId } =
            req.params;

        let client;

        try {
            // -------------------------------------------------
            // 1. FIND THE DOCUMENT
            // -------------------------------------------------

            const documentResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        home_id,
                        file_name,
                        metadata
                    FROM documents
                    WHERE id = $1
                    `,
                    [documentId]
                );

            if (
                documentResult.rows.length === 0
            ) {
                return res.status(404).json({
                    error:
                        "Document not found",
                });
            }

            const document =
                documentResult.rows[0];

            const s3Key =
                document.metadata?.s3Key ||
                null;


            // -------------------------------------------------
            // 2. DELETE THE ORIGINAL FILE FROM S3
            // -------------------------------------------------
            //
            // Older documents might not have an S3 key.
            //
            if (s3Key) {
                await deleteDocumentFromS3({
                    key:
                        s3Key,
                });
            }


            // -------------------------------------------------
            // 3. DELETE THE DATABASE RECORD
            // -------------------------------------------------

            client =
                await pool.connect();

            await client.query(
                "BEGIN"
            );

            await client.query(
                `
                DELETE FROM documents
                WHERE id = $1
                `,
                [documentId]
            );

            await client.query(
                "COMMIT"
            );


            // -------------------------------------------------
            // 4. RETURN SUCCESS
            // -------------------------------------------------

            return res.json({
                message:
                    "Document deleted successfully",

                documentId:
                    document.id,

                fileName:
                    document.file_name,
            });
        } catch (error) {
            if (client) {
                try {
                    await client.query(
                        "ROLLBACK"
                    );
                } catch (rollbackError) {
                    console.error(
                        "Document deletion rollback failed:",
                        rollbackError
                    );
                }
            }

            console.error(
                "Document deletion failed:",
                error
            );

            return res.status(500).json({
                error:
                    "Document could not be deleted",

                details:
                    error.message,
            });
        } finally {
            if (client) {
                client.release();
            }
        }
    }
);

// ---------------------------------------------------------
// UPLOAD, STORE, AND ANALYZE A HOME DOCUMENT
// ---------------------------------------------------------
//
// This route now performs the complete document workflow:
//
// 1. Receive the file with Multer.
// 2. Confirm the home exists.
// 3. Extract text from the PDF or text file.
// 4. Analyze the text with HouseIQ.
// 5. Upload the original file to private Amazon S3.
// 6. Save the document and AI-created records in CockroachDB.
// 7. Clean up the S3 file if database processing fails.
//
app.post(
    "/api/homes/:homeId/documents/upload",
    // First validate the Auth0 token.
    requireAuth,
    // Then verify ownership of the URL's homeId.
    requireHomeOwnership,
    // Only authorized requests should reach the file parser.
    upload.single("document"),

    async (req, res) => {
        const { homeId } = req.params;

        const documentType =
            req.body.documentType?.trim() ||
            "general";

        // This will hold a dedicated CockroachDB connection
        // after the transaction begins.
        let client;

        // S3 cannot participate in a CockroachDB transaction.
        //
        // We save the upload result here so that we can delete
        // the S3 object if later database work fails.
        let uploadedS3Object = null;

        try {
            // -------------------------------------------------
            // 1. VALIDATE THE UPLOADED FILE
            // -------------------------------------------------

            if (!req.file) {
                return res.status(400).json({
                    error:
                        "A document file is required",
                });
            }


            // -------------------------------------------------
            // 2. CONFIRM THAT THE HOME EXISTS
            // -------------------------------------------------

            const homeResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name
                    FROM homes
                    WHERE id = $1
                    `,
                    [homeId]
                );

            if (
                homeResult.rows.length === 0
            ) {
                return res.status(404).json({
                    error:
                        "Home not found",
                });
            }


            // -------------------------------------------------
            // 3. EXTRACT READABLE TEXT
            // -------------------------------------------------
            //
            // We do this before uploading to S3.
            //
            // If this is a scanned PDF with no readable text,
            // the request fails before we permanently store a file
            // that HouseIQ cannot currently process.
            //
            const extractedText =
                await extractTextFromUploadedFile(
                    req.file
                );


            // -------------------------------------------------
            // 4. ANALYZE THE DOCUMENT WITH HOUSEIQ
            // -------------------------------------------------

            const analysis =
                await analyzeHomeDocument({
                    fileName:
                        req.file.originalname,

                    documentType,

                    extractedText,
                });


            // -------------------------------------------------
            // 5. UPLOAD THE ORIGINAL FILE TO AMAZON S3
            // -------------------------------------------------

            uploadedS3Object =
                await uploadDocumentToS3({
                    homeId,

                    originalFileName:
                        req.file.originalname,

                    mimeType:
                        req.file.mimetype,

                    // Multer memory storage places the raw file
                    // bytes inside req.file.buffer.
                    buffer:
                        req.file.buffer,
                });


            // -------------------------------------------------
            // 6. BEGIN THE COCKROACHDB TRANSACTION
            // -------------------------------------------------

            client =
                await pool.connect();

            await client.query(
                "BEGIN"
            );


            // -------------------------------------------------
            // 7. SAVE THE DOCUMENT RECORD
            // -------------------------------------------------

            const documentResult =
                await client.query(
                    `
                    INSERT INTO documents (
                        home_id,
                        document_type,
                        file_name,
                        source_url,
                        extracted_text,
                        summary,
                        metadata
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7::JSONB
                    )
                    RETURNING *
                    `,
                    [
                        homeId,

                        documentType,

                        // Store the original filename for display.
                        req.file.originalname,

                        // This is a durable internal S3 reference.
                        //
                        // It is not a public browser URL.
                        uploadedS3Object.s3Uri,

                        extractedText,

                        analysis.summary,

                        JSON.stringify({
                            source:
                                "document_upload",

                            storageProvider:
                                "aws_s3",

                            s3Bucket:
                                uploadedS3Object.bucket,

                            s3Key:
                                uploadedS3Object.key,

                            s3Etag:
                                uploadedS3Object.etag,

                            mimeType:
                                req.file.mimetype,

                            fileSize:
                                req.file.size,

                            documentDate:
                                analysis.documentDate,

                            contractorOrCompany:
                                analysis.contractorOrCompany,

                            totalAmount:
                                analysis.totalAmount,
                        }),
                    ]
                );

            const document =
                documentResult.rows[0];


            // -------------------------------------------------
            // 8. PREPARE RESPONSE COLLECTIONS
            // -------------------------------------------------

            const createdRecords = {
                memories: [],
                issues: [],
                projects: [],
                assets: [],
            };

            const actionsTaken = [
                {
                    type:
                        "document_created",

                    recordId:
                        document.id,

                    title:
                        document.file_name ||
                        "Uploaded document",
                },
            ];


            // -------------------------------------------------
            // 9. CREATE MEMORIES FOUND IN THE DOCUMENT
            // -------------------------------------------------

            for (
                const memoryInput of
                analysis.memoriesToCreate
            ) {
                const memory =
                    await createMemoryRecord({
                        homeId,

                        title:
                            memoryInput.title,

                        category:
                            memoryInput.category,

                        content:
                            memoryInput.content,

                        importance:
                            memoryInput.importance,

                        metadata: {
                            source:
                                "document_analysis",

                            documentId:
                                document.id,

                            fileName:
                                req.file.originalname,

                            // This links the memory back to the
                            // original S3 object.
                            s3Key:
                                uploadedS3Object.key,
                        },

                        client,
                    });

                createdRecords.memories.push(
                    memory
                );

                actionsTaken.push({
                    type:
                        "memory_created",

                    recordId:
                        memory.id,

                    title:
                        memory.title,
                });
            }


            // -------------------------------------------------
            // 10. CREATE ISSUES FOUND IN THE DOCUMENT
            // -------------------------------------------------

            for (
                const issueInput of
                analysis.issuesToCreate
            ) {
                const issue =
                    await createIssueRecord({
                        homeId,

                        title:
                            issueInput.title,

                        description:
                            issueInput.description,

                        priority:
                            issueInput.priority,

                        category:
                            issueInput.category,

                        suspectedCause:
                            issueInput.suspectedCause,

                        recommendedNextStep:
                            issueInput.recommendedNextStep,

                        client,
                    });

                createdRecords.issues.push(
                    issue
                );

                actionsTaken.push({
                    type:
                        "issue_created",

                    recordId:
                        issue.id,

                    title:
                        issue.title,
                });
            }


            // -------------------------------------------------
            // 11. CREATE PROJECTS AND TASKS
            // -------------------------------------------------

            for (
                const projectInput of
                analysis.projectsToCreate
            ) {
                const project =
                    await createProjectRecord({
                        homeId,

                        title:
                            projectInput.title,

                        description:
                            projectInput.description,

                        priority:
                            projectInput.priority,

                        estimatedCostLow:
                            projectInput
                                .estimatedCostLow,

                        estimatedCostHigh:
                            projectInput
                                .estimatedCostHigh,

                        diyDifficulty:
                            projectInput
                                .diyDifficulty,

                        safetyNotes:
                            projectInput
                                .safetyNotes,

                        tasks:
                            projectInput.tasks,

                        client,
                    });

                createdRecords.projects.push(
                    project
                );

                actionsTaken.push({
                    type:
                        "project_created",

                    recordId:
                        project.id,

                    title:
                        project.title,

                    taskCount:
                        project.tasks.length,
                });
            }


            // -------------------------------------------------
            // 12. CREATE ASSETS FOUND IN THE DOCUMENT
            // -------------------------------------------------

            for (
                const assetInput of
                analysis.assetsToCreate
            ) {
                const asset =
                    await createAssetRecord({
                        homeId,

                        assetType:
                            assetInput.assetType,

                        name:
                            assetInput.name,

                        brand:
                            assetInput.brand,

                        model:
                            assetInput.model,

                        serialNumber:
                            assetInput.serialNumber,

                        location:
                            assetInput.location,

                        notes:
                            assetInput.notes,

                        client,
                    });

                createdRecords.assets.push(
                    asset
                );

                actionsTaken.push({
                    type:
                        "asset_created",

                    recordId:
                        asset.id,

                    title:
                        asset.name,
                });
            }


            // -------------------------------------------------
            // 13. COMMIT THE DATABASE TRANSACTION
            // -------------------------------------------------

            await client.query(
                "COMMIT"
            );


            // -------------------------------------------------
            // 14. RETURN THE SUCCESS RESPONSE
            // -------------------------------------------------

            return res.status(201).json({
                message:
                    "Document stored and analyzed successfully",

                document: {
                    id:
                        document.id,

                    homeId:
                        document.home_id,

                    documentType:
                        document.document_type,

                    fileName:
                        document.file_name,

                    summary:
                        document.summary,

                    // This is the internal S3 URI.
                    //
                    // The frontend does not open this directly.
                    sourceUrl:
                        document.source_url,

                    metadata:
                        document.metadata,

                    createdAt:
                        document.created_at,
                },

                analysis,

                actionsTaken,

                createdRecords,
            });
        } catch (error) {
            // -------------------------------------------------
            // 15. ROLL BACK COCKROACHDB
            // -------------------------------------------------

            if (client) {
                try {
                    await client.query(
                        "ROLLBACK"
                    );
                } catch (rollbackError) {
                    console.error(
                        "Document database rollback failed:",
                        rollbackError
                    );
                }
            }


            // -------------------------------------------------
            // 16. CLEAN UP AN ORPHANED S3 FILE
            // -------------------------------------------------
            //
            // Imagine this sequence:
            //
            // 1. S3 upload succeeds.
            // 2. Database insert fails.
            //
            // Without this cleanup, the S3 bucket would contain a
            // file that no database record knows about.
            //
            if (
                uploadedS3Object?.key
            ) {
                try {
                    await deleteDocumentFromS3({
                        key:
                            uploadedS3Object.key,
                    });
                } catch (s3CleanupError) {
                    console.error(
                        "Failed to remove orphaned S3 object:",
                        s3CleanupError
                    );
                }
            }


            console.error(
                "Document upload failed:",
                error
            );

            const clientErrorMessages = [
                "Only PDF",
                "file is empty",
                "No readable text",
                "larger than",
            ];

            const isClientError =
                clientErrorMessages.some(
                    (message) =>
                        error.message.includes(
                            message
                        )
                );

            return res
                .status(
                    isClientError
                        ? 400
                        : 500
                )
                .json({
                    error:
                        "Document could not be processed",

                    details:
                        error.message,
                });
        } finally {
            // Return the connection to the database pool.
            if (client) {
                client.release();
            }
        }
    }
);


// ---------------------------------------------------------
// HOUSEIQ AGENT ENDPOINT
// ---------------------------------------------------------

app.post(
    "/api/homes/:homeId/ask",
    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        const { homeId } = req.params;
        const { question } = req.body;

        // Validate before doing any expensive AI work.
        if (
            typeof question !== "string" ||
            !question.trim()
        ) {
            return res.status(400).json({
                error: "Question is required",
            });
        }

        let client;
        let agentResponse = null;
        let relevantMemories = [];

        try {
            // -------------------------------------------------
            // 1. CONFIRM THAT THE HOME EXISTS
            // -------------------------------------------------

            const homeResult = await pool.query(
                `
            SELECT id, name, year_built, notes
            FROM homes
            WHERE id = $1
            `,
                [homeId]
            );

            if (homeResult.rows.length === 0) {
                return res.status(404).json({
                    error: "Home not found",
                });
            }

            const home = homeResult.rows[0];


            // -------------------------------------------------
            // 2. CREATE AN EMBEDDING FOR THE USER'S MESSAGE
            // -------------------------------------------------

            const questionEmbedding =
                await createEmbedding(question.trim());

            const questionVectorSql =
                vectorToSql(questionEmbedding);


            // -------------------------------------------------
            // 3. RETRIEVE RELEVANT LONG-TERM MEMORIES
            // -------------------------------------------------

            const memoriesResult = await pool.query(
                `
            SELECT
                id,
                title,
                category,
                content,
                metadata,
                importance,
                created_at,
                embedding <=> $2::VECTOR(1536)
                    AS similarity_distance
            FROM memories
            WHERE home_id = $1
              AND embedding IS NOT NULL
            ORDER BY
                embedding <=> $2::VECTOR(1536)
            LIMIT 8
            `,
                [
                    homeId,
                    questionVectorSql,
                ]
            );

            relevantMemories = memoriesResult.rows;


            // -------------------------------------------------
            // 4. ASK THE HOUSEIQ AGENT WHAT TO DO
            // -------------------------------------------------

            agentResponse =
                await generateHouseAgentResponse(
                    question.trim(),
                    relevantMemories
                );


            // -------------------------------------------------
            // 5. START A DATABASE TRANSACTION
            // -------------------------------------------------
            //
            // A transaction means all database actions succeed
            // together or fail together.
            //
            // Without this, HouseIQ might create a memory and issue,
            // fail while creating a project, and leave the database
            // in a half-completed state.
            //
            client = await pool.connect();

            await client.query("BEGIN");


            // This object contains the actual database records created
            // during this run.
            const createdRecords = {
                memories: [],
                issues: [],
                projects: [],
                assets: [],
            };


            // This gives the frontend a simple human-readable list.
            const actionsTaken = [];


            // -------------------------------------------------
            // 6. CREATE MEMORIES
            // -------------------------------------------------

            for (
                const memoryInput of
                agentResponse.memoriesToCreate
            ) {
                const createdMemory =
                    await createMemoryRecord({
                        homeId,

                        title:
                            memoryInput.title,

                        category:
                            memoryInput.category,

                        content:
                            memoryInput.content,

                        importance:
                            memoryInput.importance,

                        metadata: {
                            source: "houseiq_agent",
                            originalQuestion:
                                question.trim(),
                        },

                        client,
                    });

                createdRecords.memories.push(
                    createdMemory
                );

                actionsTaken.push({
                    type: "memory_created",
                    recordId: createdMemory.id,
                    title: createdMemory.title,
                });
            }


            // -------------------------------------------------
            // 7. CREATE ISSUES
            // -------------------------------------------------

            for (
                const issueInput of
                agentResponse.issuesToCreate
            ) {
                const createdIssue =
                    await createIssueRecord({
                        homeId,

                        title:
                            issueInput.title,

                        description:
                            issueInput.description,

                        priority:
                            issueInput.priority,

                        category:
                            issueInput.category,

                        suspectedCause:
                            issueInput.suspectedCause,

                        recommendedNextStep:
                            issueInput.recommendedNextStep,

                        client,
                    });

                createdRecords.issues.push(
                    createdIssue
                );

                actionsTaken.push({
                    type: "issue_created",
                    recordId: createdIssue.id,
                    title: createdIssue.title,
                });
            }


            // -------------------------------------------------
            // 8. CREATE PROJECTS AND TASKS
            // -------------------------------------------------

            for (
                const projectInput of
                agentResponse.projectsToCreate
            ) {
                const createdProject =
                    await createProjectRecord({
                        homeId,

                        title:
                            projectInput.title,

                        description:
                            projectInput.description,

                        priority:
                            projectInput.priority,

                        estimatedCostLow:
                            projectInput.estimatedCostLow,

                        estimatedCostHigh:
                            projectInput.estimatedCostHigh,

                        diyDifficulty:
                            projectInput.diyDifficulty,

                        safetyNotes:
                            projectInput.safetyNotes,

                        tasks:
                            projectInput.tasks,

                        client,
                    });

                createdRecords.projects.push(
                    createdProject
                );

                actionsTaken.push({
                    type: "project_created",
                    recordId: createdProject.id,
                    title: createdProject.title,
                    taskCount:
                        createdProject.tasks.length,
                });
            }


            // -------------------------------------------------
            // 9. CREATE ASSETS
            // -------------------------------------------------

            for (
                const assetInput of
                agentResponse.assetsToCreate
            ) {
                const createdAsset =
                    await createAssetRecord({
                        homeId,

                        assetType:
                            assetInput.assetType,

                        name:
                            assetInput.name,

                        brand:
                            assetInput.brand,

                        model:
                            assetInput.model,

                        serialNumber:
                            assetInput.serialNumber,

                        location:
                            assetInput.location,

                        notes:
                            assetInput.notes,

                        client,
                    });

                createdRecords.assets.push(
                    createdAsset
                );

                actionsTaken.push({
                    type: "asset_created",
                    recordId: createdAsset.id,
                    title: createdAsset.name,
                });
            }


            // -------------------------------------------------
            // 10. LOG THE COMPLETE AGENT RUN
            // -------------------------------------------------

            const agentRunResult =
                await client.query(
                    `
                INSERT INTO agent_runs (
                    home_id,
                    user_question,
                    answer,
                    status,
                    confidence,
                    needs_more_info,
                    clarifying_questions,
                    memories_used,
                    actions_taken
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7::JSONB,
                    $8::JSONB,
                    $9::JSONB
                )
                RETURNING *
                `,
                    [
                        homeId,
                        question.trim(),
                        agentResponse.answer,
                        "completed",
                        agentResponse.confidence,
                        agentResponse.needsMoreInfo,

                        JSON.stringify(
                            agentResponse.clarifyingQuestions
                        ),

                        JSON.stringify(
                            relevantMemories.map(
                                (memory) => memory.id
                            )
                        ),

                        JSON.stringify(actionsTaken),
                    ]
                );

            const agentRun =
                agentRunResult.rows[0];


            // -------------------------------------------------
            // 11. COMMIT THE TRANSACTION
            // -------------------------------------------------

            await client.query("COMMIT");


            // -------------------------------------------------
            // 12. RETURN EVERYTHING THE FRONTEND NEEDS
            // -------------------------------------------------

            return res.json({
                question: question.trim(),

                home: {
                    id: home.id,
                    name: home.name,
                },

                answer:
                    agentResponse.answer,

                confidence:
                    agentResponse.confidence,

                needsMoreInfo:
                    agentResponse.needsMoreInfo,

                clarifyingQuestions:
                    agentResponse.clarifyingQuestions,

                actionsTaken,

                createdRecords,

                memoriesUsed:
                    relevantMemories,

                agentRunId:
                    agentRun.id,
            });
        } catch (error) {
            // If the transaction started, undo all pending writes.
            if (client) {
                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    console.error(
                        "Failed to roll back transaction:",
                        rollbackError
                    );
                }
            }

            console.error(
                "Error running HouseIQ agent:",
                error
            );

            // Log the failed run outside the rolled-back transaction
            // so every interaction still leaves an agent_runs record.
            try {
                await pool.query(
                    `
                INSERT INTO agent_runs (
                    home_id,
                    user_question,
                    answer,
                    status,
                    confidence,
                    needs_more_info,
                    clarifying_questions,
                    memories_used,
                    actions_taken
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7::JSONB,
                    $8::JSONB,
                    $9::JSONB
                )
                `,
                    [
                        homeId,
                        question.trim(),
                        agentResponse?.answer || null,
                        "failed",
                        agentResponse?.confidence || "low",
                        agentResponse?.needsMoreInfo || false,
                        JSON.stringify(
                            agentResponse?.clarifyingQuestions || []
                        ),
                        JSON.stringify(
                            relevantMemories.map(
                                (memory) => memory.id
                            )
                        ),
                        JSON.stringify([]),
                    ]
                );
            } catch (logError) {
                console.error(
                    "Failed to log failed agent run:",
                    logError
                );
            }

            return res.status(500).json({
                error: "HouseIQ could not process the request",

                // This is useful during local development.
                // You may remove details before production.
                details: error.message,
            });
        } finally {
            // Return the database connection to the pool.
            if (client) {
                client.release();
            }
        }
    });

// ---------------------------------------------------------
// GLOBAL ERROR HANDLER
// ---------------------------------------------------------
//
// Express sends errors from Multer and other middleware here.
//
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (
            error.code ===
            "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                error:
                    "The uploaded file is too large",

                details:
                    "The maximum supported file size is 10 MB.",
            });
        }

        return res.status(400).json({
            error:
                "The file upload could not be processed",

            details:
                error.message,
        });
    }

    if (
        error?.message?.includes(
            "Only PDF and plain-text"
        )
    ) {
        return res.status(400).json({
            error:
                "Unsupported document type",

            details:
                error.message,
        });
    }

    // Auth0 middleware throws UnauthorizedError (and subclasses)
    // when the Bearer token is missing or invalid.
    if (error instanceof UnauthorizedError) {
        if (error.headers) {
            res.set(error.headers);
        }

        return res.status(
            error.status ||
            error.statusCode ||
            401
        ).json({
            error:
                "Authentication required",

            details:
                error.message ||
                "Missing or invalid access token",
        });
    }

    console.error(
        "Unhandled server error:",
        error
    );

    return res.status(500).json({
        error:
            "An unexpected server error occurred",
    });
});

export { app, pool };

const PORT = process.env.PORT || 5000;

const isMainModule =
    process.argv[1] &&
    path.resolve(process.argv[1]) ===
        path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
    app.listen(PORT, () => {
        console.log(
            `HouseIQ backend running on port ${PORT}`
        );
    });
}