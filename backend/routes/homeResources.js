// backend/routes/homeResources.js

import {
    Router,
} from "express";

import {
    createEmbedding,
    vectorToSql,
} from "../services/ai/index.js";

import {
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireHomeOwnership,
} from "../middleware/ownership.js";

import {
    createAssetRecord,
    createIssueRecord,
    createMemoryRecord,
} from "../services/recordHelpers.js";

export function createHomeResourcesRouter() {
    const router = Router();

    // Add a memory to a home manually.
    // Later, most memories will be created automatically by the agent,
    // but keeping this route is useful for testing and power users.
    router.post(
        "/homes/:homeId/memories",
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
    router.get(
        "/homes/:homeId/memories",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
                    `
          SELECT
            memories.id,
            memories.home_id,
            memories.asset_id,
            memories.title,
            memories.category,
            memories.content,
            memories.metadata,
            memories.importance,
            memories.source_document_id,
            memories.source_agent_run_id,
            memories.created_at,
            memories.updated_at,
            documents.file_name AS source_file_name,
            documents.document_type AS source_document_type
          FROM memories
          LEFT JOIN documents
            ON documents.id = memories.source_document_id
          WHERE memories.home_id = $1
          ORDER BY memories.created_at DESC
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
    router.post(
        "/homes/:homeId/memory-search",
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
    router.get(
        "/homes/:homeId/issues",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
                    `
                SELECT
                    home_issues.*,
                    documents.file_name AS source_file_name,
                    documents.document_type AS source_document_type
                FROM home_issues
                LEFT JOIN documents
                    ON documents.id = home_issues.source_document_id
                WHERE home_issues.home_id = $1
                ORDER BY
                    CASE home_issues.priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    home_issues.created_at DESC
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
    router.get(
        "/homes/:homeId/projects",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                // Get every project for this home.
                const projectsResult = await pool.query(
                    `
                SELECT
                    home_projects.*,
                    documents.file_name AS source_file_name,
                    documents.document_type AS source_document_type
                FROM home_projects
                LEFT JOIN documents
                    ON documents.id = home_projects.source_document_id
                WHERE home_projects.home_id = $1
                ORDER BY home_projects.created_at DESC
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
    router.get(
        "/homes/:homeId/assets",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
                    `
                SELECT
                    home_assets.*,
                    documents.file_name AS source_file_name,
                    documents.document_type AS source_document_type
                FROM home_assets
                LEFT JOIN documents
                    ON documents.id = home_assets.source_document_id
                WHERE home_assets.home_id = $1
                ORDER BY home_assets.created_at DESC
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

    // Manual issue create (homeowner-owned memory graph).
    router.post(
        "/homes/:homeId/issues",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const {
                    title,
                    description,
                    priority,
                    category,
                    suspectedCause,
                    recommendedNextStep,
                } = req.body || {};

                if (!title?.trim()) {
                    return res.status(400).json({
                        error: "Issue title is required",
                    });
                }

                const issue = await createIssueRecord({
                    homeId,
                    title,
                    description,
                    priority,
                    category,
                    suspectedCause,
                    recommendedNextStep,
                });

                return res.status(201).json(issue);
            } catch (error) {
                console.error(
                    "Error creating issue:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to create issue",
                });
            }
        }
    );

    router.post(
        "/homes/:homeId/assets",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const {
                    assetType,
                    name,
                    brand,
                    model,
                    serialNumber,
                    location,
                    notes,
                } = req.body || {};

                const asset = await createAssetRecord({
                    homeId,
                    assetType,
                    name,
                    brand,
                    model,
                    serialNumber,
                    location,
                    notes,
                });

                return res.status(201).json(asset);
            } catch (error) {
                console.error(
                    "Error creating asset:",
                    error
                );
                return res.status(500).json({
                    error:
                        error.message ||
                        "Failed to create asset",
                });
            }
        }
    );

    return router;
}
