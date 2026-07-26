// backend/routes/homeResources.js

import {
    Router,
} from "express";

import {
    createEmbedding,
    vectorToSql,
} from "../ai.js";

import {
    requireAuth,
} from "../auth.js";

import { pool } from "../db.js";

import {
    requireHomeOwnership,
} from "../ownership.js";

import {
    createMemoryRecord,
} from "../recordHelpers.js";

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
    router.get(
        "/homes/:homeId/assets",
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

    return router;
}
