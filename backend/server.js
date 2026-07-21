// backend/server.js

// Loads variables from .env into process.env
import "dotenv/config";

// Express creates our API server
import express from "express";

// CORS allows the frontend to talk to the backend
import cors from "cors";

// pg lets Node connect to PostgreSQL-compatible databases like CockroachDB
import pg from "pg";

// AI functions
import { createEmbedding, vectorToSql, generateHouseAgentResponse } from "./ai.js";

const { Pool } = pg;

const app = express();

app.use(cors());
app.use(express.json());

// Create one reusable database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false,
    },
});

// ---------------------------------------------------------
// DATABASE RECORD HELPERS
// ---------------------------------------------------------

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


// Simple health check route
app.get("/", (req, res) => {
    res.json({
        message: "HouseIQ backend is running",
    });
});

// Test database connection
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

// Create a new home
app.post("/api/homes", async (req, res) => {
    try {
        const { name, yearBuilt, notes } = req.body;

        if (!name) {
            return res.status(400).json({
                error: "Home name is required",
            });
        }

        const result = await pool.query(
            `
      INSERT INTO homes (name, year_built, notes)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
            [name, yearBuilt || null, notes || ""]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error creating home:", error);
        res.status(500).json({
            error: "Failed to create home",
        });
    }
});

// Get all homes
app.get("/api/homes", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT *
      FROM homes
      ORDER BY created_at DESC
    `);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching homes:", error);
        res.status(500).json({
            error: "Failed to fetch homes",
        });
    }
});

// Add a memory to a home manually.
// Later, most memories will be created automatically by the agent,
// but keeping this route is useful for testing and power users.
app.post("/api/homes/:homeId/memories", async (req, res) => {
    try {
        const { homeId } = req.params;

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
            details: error.message,
        });
    }
});

// Get memories for one home
app.get("/api/homes/:homeId/memories", async (req, res) => {
    try {
        const { homeId } = req.params;

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
app.post("/api/homes/:homeId/memory-search", async (req, res) => {
    try {
        const { homeId } = req.params;
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
            details: error.message,
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
app.get("/api/homes/:homeId/issues", async (req, res) => {
    try {
        const { homeId } = req.params;

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
            details: error.message,
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
app.get("/api/homes/:homeId/projects", async (req, res) => {
    try {
        const { homeId } = req.params;

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
            details: error.message,
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
app.get("/api/homes/:homeId/assets", async (req, res) => {
    try {
        const { homeId } = req.params;

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
            details: error.message,
        });
    }
});

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
// HOUSEIQ AGENT ENDPOINT
// ---------------------------------------------------------

app.post("/api/homes/:homeId/ask", async (req, res) => {
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`HouseIQ backend running on port ${PORT}`);
});