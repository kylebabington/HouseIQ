// backend/routes/needs.js

import {
    Router,
} from "express";

import {
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireHomeAccess,
} from "../middleware/ownership.js";

import {
    seasonalNeedHints,
} from "../lib/climateZones.js";

import {
    lifecycleNeedItems,
} from "../lib/assetServiceIntervals.js";

const PRIORITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};

export function createNeedsRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/needs",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const [
                    profileResult,
                    issuesResult,
                    projectsResult,
                    assetsResult,
                ] = await Promise.all([
                    pool.query(
                        `
                        SELECT *
                        FROM home_profiles
                        WHERE home_id = $1
                        LIMIT 1
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, priority, status, category
                        FROM home_issues
                        WHERE home_id = $1
                          AND status NOT IN ('resolved', 'closed')
                        ORDER BY updated_at DESC
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, priority, status
                        FROM home_projects
                        WHERE home_id = $1
                          AND status NOT IN ('completed', 'cancelled')
                        ORDER BY updated_at DESC
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT
                            id,
                            name,
                            asset_type,
                            install_date,
                            purchase_date
                        FROM home_assets
                        WHERE home_id = $1
                        `,
                        [homeId]
                    ),
                ]);

                const profile =
                    profileResult.rows[0] || null;

                const items = [];

                for (const issue of issuesResult.rows) {
                    items.push({
                        kind: "issue",
                        id: issue.id,
                        title: issue.title,
                        reason:
                            `Open ${issue.priority || "medium"}-priority issue` +
                            (issue.category
                                ? ` (${issue.category})`
                                : ""),
                        priority:
                            issue.priority || "medium",
                        sourceHints: ["issue"],
                    });
                }

                for (const project of projectsResult.rows) {
                    items.push({
                        kind: "project",
                        id: project.id,
                        title: project.title,
                        reason:
                            `Active project (${project.status})`,
                        priority:
                            project.priority || "medium",
                        sourceHints: ["project"],
                    });
                }

                items.push(
                    ...lifecycleNeedItems(
                        assetsResult.rows
                    )
                );

                items.push(
                    ...seasonalNeedHints(profile)
                );

                items.sort((a, b) => {
                    const ra =
                        PRIORITY_RANK[a.priority] ?? 9;
                    const rb =
                        PRIORITY_RANK[b.priority] ?? 9;
                    return ra - rb;
                });

                return res.json({
                    items: items.slice(0, 20),
                });
            } catch (error) {
                console.error(
                    "Error building needs board:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Failed to load what this house needs",
                });
            }
        }
    );

    return router;
}
