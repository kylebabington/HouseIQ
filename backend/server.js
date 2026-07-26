// backend/server.js

// Loads variables from .env into process.env
import "dotenv/config";

// Express creates our API server
import express from "express";

// CORS allows the frontend to talk to the backend
import cors from "cors";

// Multer handles uploaded files sent as multipart/form-data.
import multer from "multer";

import { createEmbedding, vectorToSql } from "./ai.js";

import {
    UnauthorizedError,
} from "express-oauth2-jwt-bearer";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "./auth.js";

import { pool } from "./db.js";

import {
    formatHomeProfile,
    HOME_PROFILE_FIELDS,
    validateHomeProfileValue,
} from "./homeProfile.js";

import {
    requireHomeOwnership,
} from "./ownership.js";

import {
    isValidUuid,
} from "./validation.js";

import { createAgentRouter } from "./routes/agent.js";
import { createDocumentsRouter } from "./routes/documents.js";

import {
    createMemoryRecord,
} from "./recordHelpers.js";

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



// Create a new home owned by the authenticated Auth0 user.
app.post(
    "/api/homes",
    requireAuth,
    async (req, res) => {
        try {
            const { name, yearBuilt, notes } = req.body;

            const safeName =
                typeof name === "string"
                    ? name.trim()
                    : "";

            if (!safeName) {
                return res.status(400).json({
                    error: "Home name is required",
                });
            }

            const ownerAuth0Id =
                getAuthenticatedUserId(req);

            const result =
                await pool.query(
                    `
                INSERT INTO homes (
                    owner_auth0_id,
                    name,
                    year_built,
                    notes
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4
                )
                RETURNING
                    id,
                    name,
                    year_built,
                    notes,
                    created_at,
                    updated_at
                `,
                    [
                        ownerAuth0Id,
                        safeName,
                        yearBuilt || null,
                        typeof notes === "string"
                            ? notes.trim()
                            : "",
                    ]
                );

            res.status(201).json(result.rows[0]);
        } catch (error) {
            console.error("Error creating home:", error);
            res.status(500).json({
                error: "Failed to create home",
            });
        }
    });

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
            SELECT
                id,
                name,
                year_built,
                notes,
                created_at,
                updated_at
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
    });

// ---------------------------------------------------------
// GET HOME PROFILE
// ---------------------------------------------------------
//
// Returns the structured profile for one authorized home.
//
// A LEFT JOIN is used because older homes may not have a
// home_profiles record yet.
//
// In that case, the endpoint still returns a complete response
// with null profile fields and onboardingStatus not_started.
//
app.get(
    "/api/homes/:homeId/profile",

    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const homeId =
                req.authorizedHomeId;

            const result =
                await pool.query(
                    `
                    SELECT
                        homes.id
                            AS home_id,

                        homes.name
                            AS home_name,

                        homes.year_built,

                        home_profiles.property_type,
                        home_profiles.square_feet,
                        home_profiles.bedrooms,
                        home_profiles.full_bathrooms,
                        home_profiles.half_bathrooms,
                        home_profiles.stories,

                        home_profiles.foundation_type,
                        home_profiles.basement_type,
                        home_profiles.exterior_material,
                        home_profiles.roof_material,

                        home_profiles.heating_type,
                        home_profiles.cooling_type,
                        home_profiles.water_heater_type,
                        home_profiles.water_source,
                        home_profiles.sewer_type,
                        home_profiles.electrical_service_amps,

                        home_profiles.garage_type,
                        home_profiles.garage_spaces,
                        home_profiles.lot_size_acres,

                        home_profiles.onboarding_status,
                        home_profiles.onboarding_step,
                        home_profiles.metadata,

                        home_profiles.created_at
                            AS profile_created_at,

                        home_profiles.updated_at
                            AS profile_updated_at

                    FROM homes

                    LEFT JOIN home_profiles
                        ON home_profiles.home_id =
                            homes.id

                    WHERE homes.id = $1

                    LIMIT 1
                    `,
                    [
                        homeId,
                    ]
                );

            // This should be unusual because ownership middleware
            // already verified the home. It protects against the
            // home being deleted between the middleware query and
            // this route query.
            if (
                result.rows.length ===
                0
            ) {
                return res
                    .status(404)
                    .json({
                        error:
                            "Home not found",
                    });
            }

            return res.json(
                formatHomeProfile(
                    result.rows[0]
                )
            );
        } catch (error) {
            console.error(
                "Error fetching home profile:",
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        "Failed to fetch home profile",
                });
        }
    }
);

// ---------------------------------------------------------
// PATCH HOME PROFILE
// ---------------------------------------------------------
//
// Creates or partially updates the structured profile for an
// authorized home.
//
// Only fields in HOME_PROFILE_FIELDS are accepted.
//
// The SQL column names come from our server-controlled
// allowlist. They never come directly from request text.
//
app.patch(
    "/api/homes/:homeId/profile",

    requireAuth,
    requireHomeOwnership,

    async (req, res) => {
        try {
            const homeId =
                req.authorizedHomeId;

            const requestBody =
                req.body;

            if (
                !requestBody ||
                typeof requestBody !==
                "object" ||
                Array.isArray(
                    requestBody
                )
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "A profile update object is required",
                    });
            }


            const requestEntries =
                Object.entries(
                    requestBody
                );

            if (
                requestEntries.length ===
                0
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "At least one profile field is required",
                    });
            }


            const normalizedUpdates =
                [];

            const validationErrors =
                {};


            for (
                const [
                    fieldName,
                    rawValue,
                ] of requestEntries
            ) {
                const databaseColumn =
                    HOME_PROFILE_FIELDS[
                    fieldName
                    ];

                if (
                    !databaseColumn
                ) {
                    validationErrors[
                        fieldName
                    ] =
                        "This field cannot be updated";

                    continue;
                }

                const validation =
                    validateHomeProfileValue(
                        fieldName,
                        rawValue
                    );

                if (
                    !validation.valid
                ) {
                    validationErrors[
                        fieldName
                    ] =
                        validation.error;

                    continue;
                }

                normalizedUpdates.push({
                    apiField:
                        fieldName,

                    databaseColumn,

                    value:
                        validation.value,
                });
            }


            if (
                Object.keys(
                    validationErrors
                ).length > 0
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Home profile validation failed",

                        fields:
                            validationErrors,
                    });
            }


            // Build:
            //
            // property_type = $2
            // square_feet = $3
            //
            // Column names are safe because they came from the
            // server-owned allowlist above.
            const insertColumns =
                normalizedUpdates.map(
                    (update) =>
                        update.databaseColumn
                );

            const values =
                normalizedUpdates.map(
                    (update) =>
                        update.value
                );

            const insertPlaceholders =
                values.map(
                    (
                        value,
                        index
                    ) =>
                        `$${index + 2}`
                );

            const conflictUpdates =
                insertColumns.map(
                    (column) =>
                        `${column} = excluded.${column}`
                );


            const result =
                await pool.query(
                    `
                    INSERT INTO home_profiles (
                        home_id,
                        ${insertColumns.join(
                        ", "
                    )}
                    )
                    VALUES (
                        $1,
                        ${insertPlaceholders.join(
                        ", "
                    )}
                    )

                    ON CONFLICT (
                        home_id
                    )
                    DO UPDATE SET
                        ${conflictUpdates.join(
                        ", "
                    )},
                        updated_at = now()

                    RETURNING *
                    `,
                    [
                        homeId,
                        ...values,
                    ]
                );


            const updatedProfile =
                result.rows[0];


            // Read the home fields that belong to the main
            // homes table so the response matches GET /profile.
            const homeResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        year_built
                    FROM homes
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        homeId,
                    ]
                );


            if (
                homeResult.rows.length ===
                0
            ) {
                return res
                    .status(404)
                    .json({
                        error:
                            "Home not found",
                    });
            }


            const home =
                homeResult.rows[0];


            return res.json(
                formatHomeProfile({
                    home_id:
                        home.id,

                    home_name:
                        home.name,

                    year_built:
                        home.year_built,

                    ...updatedProfile,

                    profile_created_at:
                        updatedProfile
                            .created_at,

                    profile_updated_at:
                        updatedProfile
                            .updated_at,
                })
            );
        } catch (error) {
            console.error(
                "Error updating home profile:",
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        "Failed to update home profile",
                });
        }
    }
);

// Add a memory to a home manually.
// Later, most memories will be created automatically by the agent,
// but keeping this route is useful for testing and power users.
app.post(
    "/api/homes/:homeId/memories",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;

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
                    error: "Memory content is required",
                });
            }

            const memory = await createMemoryRecord({
                homeId,
                assetId: assetId || null,
                title: title || "Untitled memory",
                category: category || "general",
                content,
                metadata: metadata || {},
                importance: importance || 3,
            });

            res.status(201).json(memory);
        } catch (error) {
            console.error("Error creating memory:", error);

            res.status(500).json({
                error: "Failed to create memory",
            });
        }
    });

// Get memories for one home
app.get(
    "/api/homes/:homeId/memories",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;

            const result = await pool.query(
                `
      SELECT *
      FROM memories
      WHERE home_id = $1
      ORDER BY created_at DESC
      `,
                [homeId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error("Error fetching memories:", error);
            res.status(500).json({
                error: "Failed to fetch memories",
            });
        }
    });

// Semantic memory search
app.post(
    "/api/homes/:homeId/memory-search",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;
            const { query } = req.body;

            if (!query) {
                return res.status(400).json({
                    error: "Search query is required",
                });
            }

            const queryEmbedding = await createEmbedding(query);
            const queryVectorSql = vectorToSql(queryEmbedding);

            const result = await pool.query(
                `
      SELECT
        id,
        title,
        category,
        content,
        metadata,
        importance,
        created_at,

        -- Lower cosine distance means more similar.
        embedding <=> $2::VECTOR(1536) AS similarity_distance

      FROM memories
      WHERE home_id = $1
        AND embedding IS NOT NULL

      ORDER BY embedding <=> $2::VECTOR(1536)

      LIMIT 5
      `,
                [homeId, queryVectorSql]
            );

            res.json({
                query,
                results: result.rows,
            });
        } catch (error) {
            console.error("Memory search failed:", error);

            res.status(500).json({
                error: "Memory search failed",
            });
        }
    });

// ---------------------------------------------------------
// GET HOME ISSUES
// ---------------------------------------------------------
//
// Returns all issues belonging to one home.
//
// The frontend uses this route to populate the Issues tab.
//
app.get(
    "/api/homes/:homeId/issues",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;

            const result = await pool.query(
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
                [homeId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error(
                "Error fetching home issues:",
                error
            );

            res.status(500).json({
                error: "Failed to fetch home issues",
            });
        }
    });

// ---------------------------------------------------------
// GET HOME PROJECTS
// ---------------------------------------------------------
//
// Returns each project along with its project tasks.
//
// We retrieve the projects first, then retrieve all tasks
// belonging to those projects.
//
app.get(
    "/api/homes/:homeId/projects",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;

            // Get every project for this home.
            const projectsResult = await pool.query(
                `
            SELECT *
            FROM home_projects
            WHERE home_id = $1
            ORDER BY created_at DESC
            `,
                [homeId]
            );

            const projects = projectsResult.rows;

            // If the home has no projects, return immediately.
            //
            // This also prevents us from building an invalid
            // SQL query with an empty list of project IDs.
            if (projects.length === 0) {
                return res.json([]);
            }

            const projectIds = projects.map(
                (project) => project.id
            );

            // Get all tasks belonging to any of these projects.
            //
            // ANY($1::UUID[]) means:
            //
            // "Return rows where project_id equals any UUID
            // inside the supplied array."
            const tasksResult = await pool.query(
                `
            SELECT *
            FROM project_tasks
            WHERE project_id = ANY($1::UUID[])
            ORDER BY project_id, task_order ASC
            `,
                [projectIds]
            );

            const tasks = tasksResult.rows;

            // Attach the correct tasks to each project.
            const projectsWithTasks = projects.map(
                (project) => {
                    return {
                        ...project,

                        tasks: tasks.filter(
                            (task) =>
                                task.project_id ===
                                project.id
                        ),
                    };
                }
            );

            res.json(projectsWithTasks);
        } catch (error) {
            console.error(
                "Error fetching home projects:",
                error
            );

            res.status(500).json({
                error: "Failed to fetch home projects",
            });
        }
    });

// ---------------------------------------------------------
// GET HOME ASSETS
// ---------------------------------------------------------
//
// Returns appliances, systems, tools, and equipment
// connected to one home.
//
app.get(
    "/api/homes/:homeId/assets",
    requireAuth,
    requireHomeOwnership,
    async (req, res) => {
        try {
            const homeId = req.authorizedHomeId;

            const result = await pool.query(
                `
            SELECT *
            FROM home_assets
            WHERE home_id = $1
            ORDER BY created_at DESC
            `,
                [homeId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error(
                "Error fetching home assets:",
                error
            );

            res.status(500).json({
                error: "Failed to fetch home assets",
            });
        }
    });

app.use(
    "/api",
    createDocumentsRouter(upload)
);

app.use(
    "/api",
    createAgentRouter()
);

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
                "Only PDF and plain-text (.txt) documents are supported.",
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

// Export the Express application so automated tests can send
// requests through it without starting a permanent network server.
export { app };


// Only start the real HTTP server outside the test environment.
//
// During a Vitest run, Supertest imports `app` and creates its own
// temporary connection. Calling app.listen() here during tests would
// create an unnecessary open server and could prevent Vitest from
// exiting cleanly.
if (process.env.NODE_ENV !== "test") {
    const PORT =
        process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log(
            `HouseIQ backend running on port ${PORT}`
        );
    });
}