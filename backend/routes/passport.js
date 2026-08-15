// backend/routes/passport.js
// Home Passport export + home timeline.

import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { requireHomeAccess } from "../middleware/ownership.js";

const SCOPES = {
    full: [
        "profile",
        "assets",
        "issues",
        "projects",
        "maintenance",
        "documents",
        "memories",
    ],
    contractor: ["profile", "assets", "issues", "maintenance"],
    buyer: [
        "profile",
        "assets",
        "projects",
        "maintenance",
        "documents",
    ],
    family: [
        "profile",
        "assets",
        "issues",
        "projects",
        "memories",
    ],
};

export function createPassportRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/passport",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const scopeKey =
                    typeof req.query.scope === "string" &&
                    SCOPES[req.query.scope]
                        ? req.query.scope
                        : "full";
                const sections = new Set(SCOPES[scopeKey]);

                const payload = {
                    homeId,
                    scope: scopeKey,
                    generatedAt: new Date().toISOString(),
                };

                if (sections.has("profile")) {
                    const result = await pool.query(
                        `
                        SELECT homes.name, homes.year_built,
                               home_profiles.*
                        FROM homes
                        LEFT JOIN home_profiles
                          ON home_profiles.home_id = homes.id
                        WHERE homes.id = $1
                        `,
                        [homeId]
                    );
                    payload.profile = result.rows[0] || null;
                }

                if (sections.has("assets")) {
                    const result = await pool.query(
                        `
                        SELECT id, asset_type, name, brand, model,
                               install_date, purchase_date,
                               warranty_expiration, last_service_date,
                               location, notes, evidence_passage
                        FROM home_assets
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY name ASC
                        `,
                        [homeId]
                    );
                    payload.assets = result.rows;
                }

                if (sections.has("issues")) {
                    const result = await pool.query(
                        `
                        SELECT id, title, description, status, priority,
                               category, evidence_passage, evidence_page
                        FROM home_issues
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY created_at DESC
                        `,
                        [homeId]
                    );
                    payload.issues = result.rows;
                }

                if (sections.has("projects")) {
                    const result = await pool.query(
                        `
                        SELECT id, title, description, status, priority,
                               estimated_cost_low, estimated_cost_high
                        FROM home_projects
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY created_at DESC
                        `,
                        [homeId]
                    );
                    payload.projects = result.rows;
                }

                if (sections.has("maintenance")) {
                    try {
                        const result = await pool.query(
                            `
                            SELECT *
                            FROM maintenance_events
                            WHERE home_id = $1
                              AND COALESCE(verification_status, 'accepted') = 'accepted'
                            ORDER BY COALESCE(completed_at, created_at::date) DESC
                            LIMIT 50
                            `,
                            [homeId]
                        );
                        payload.maintenance = result.rows;
                    } catch {
                        payload.maintenance = [];
                    }
                }

                if (sections.has("documents")) {
                    const result = await pool.query(
                        `
                        SELECT id, document_type, file_name, summary, created_at
                        FROM documents
                        WHERE home_id = $1
                        ORDER BY created_at DESC
                        LIMIT 40
                        `,
                        [homeId]
                    );
                    payload.documents = result.rows;
                }

                if (sections.has("memories")) {
                    const result = await pool.query(
                        `
                        SELECT id, title, category, content,
                               evidence_passage, evidence_page, created_at
                        FROM memories
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY importance DESC, created_at DESC
                        LIMIT 40
                        `,
                        [homeId]
                    );
                    payload.memories = result.rows;
                }

                return res.json(payload);
            } catch (error) {
                console.error("Passport export failed:", error);
                return res.status(500).json({
                    error: "Failed to build Home Passport",
                });
            }
        }
    );

    router.get(
        "/homes/:homeId/timeline",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const events = [];

                const [
                    docs,
                    issues,
                    projects,
                    assets,
                    memories,
                ] = await Promise.all([
                    pool.query(
                        `
                        SELECT id, file_name AS title, document_type AS kind,
                               created_at AS occurred_at, 'document' AS source
                        FROM documents WHERE home_id = $1
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, category AS kind, created_at AS occurred_at,
                               'issue' AS source, evidence_passage
                        FROM home_issues
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, status AS kind, created_at AS occurred_at,
                               'project' AS source
                        FROM home_projects
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, name AS title, asset_type AS kind,
                               COALESCE(install_date::timestamptz, created_at) AS occurred_at,
                               'asset' AS source
                        FROM home_assets
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, category AS kind, created_at AS occurred_at,
                               'memory' AS source, evidence_passage
                        FROM memories
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        `,
                        [homeId]
                    ),
                ]);

                for (const row of [
                    ...docs.rows,
                    ...issues.rows,
                    ...projects.rows,
                    ...assets.rows,
                    ...memories.rows,
                ]) {
                    events.push(row);
                }

                try {
                    const maintenance = await pool.query(
                        `
                        SELECT id,
                               COALESCE(notes, event_type) AS title,
                               event_type AS kind,
                               COALESCE(completed_at::timestamptz, created_at) AS occurred_at,
                               'maintenance' AS source
                        FROM maintenance_events
                        WHERE home_id = $1
                        `,
                        [homeId]
                    );
                    events.push(...maintenance.rows);
                } catch {
                    /* table may be unavailable in older DBs */
                }

                events.sort(
                    (a, b) =>
                        new Date(b.occurred_at) -
                        new Date(a.occurred_at)
                );

                return res.json({
                    homeId,
                    events: events.slice(0, 100),
                });
            } catch (error) {
                console.error("Timeline failed:", error);
                return res.status(500).json({
                    error: "Failed to load home timeline",
                });
            }
        }
    );

    return router;
}
