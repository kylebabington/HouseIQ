// backend/routes/proposals.js

import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import {
    requireHomeAccess,
    requireHomeOwnership,
} from "../middleware/ownership.js";
import { isValidUuid } from "../lib/validation.js";

const RECORD_TABLES = {
    memory: "memories",
    issue: "home_issues",
    project: "home_projects",
    asset: "home_assets",
};

export function createProposalsRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/proposals",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const [memories, issues, projects, assets] =
                    await Promise.all([
                        pool.query(
                            `
                            SELECT id, title, category, content,
                                   evidence_passage, evidence_page,
                                   source_document_id, created_at,
                                   'memory' AS record_kind
                            FROM memories
                            WHERE home_id = $1
                              AND verification_status = 'proposed'
                            ORDER BY created_at DESC
                            `,
                            [homeId]
                        ),
                        pool.query(
                            `
                            SELECT id, title, description, priority,
                                   category, evidence_passage, evidence_page,
                                   source_document_id, created_at,
                                   'issue' AS record_kind
                            FROM home_issues
                            WHERE home_id = $1
                              AND verification_status = 'proposed'
                            ORDER BY created_at DESC
                            `,
                            [homeId]
                        ),
                        pool.query(
                            `
                            SELECT id, title, description, priority,
                                   evidence_passage, evidence_page,
                                   source_document_id, created_at,
                                   'project' AS record_kind
                            FROM home_projects
                            WHERE home_id = $1
                              AND verification_status = 'proposed'
                            ORDER BY created_at DESC
                            `,
                            [homeId]
                        ),
                        pool.query(
                            `
                            SELECT id, name, asset_type, brand, model,
                                   install_date, purchase_date,
                                   warranty_expiration,
                                   evidence_passage, evidence_page,
                                   source_document_id, created_at,
                                   'asset' AS record_kind
                            FROM home_assets
                            WHERE home_id = $1
                              AND verification_status = 'proposed'
                            ORDER BY created_at DESC
                            `,
                            [homeId]
                        ),
                    ]);

                return res.json({
                    memories: memories.rows,
                    issues: issues.rows,
                    projects: projects.rows,
                    assets: assets.rows,
                    total:
                        memories.rows.length +
                        issues.rows.length +
                        projects.rows.length +
                        assets.rows.length,
                });
            } catch (error) {
                console.error("Error loading proposals:", error);
                return res.status(500).json({
                    error: "Failed to load proposed changes",
                });
            }
        }
    );

    router.post(
        "/homes/:homeId/proposals/:kind/:recordId/:action",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { kind, recordId, action } = req.params;

                const table = RECORD_TABLES[kind];
                if (!table) {
                    return res.status(400).json({
                        error: "Unknown proposal kind",
                    });
                }

                if (!isValidUuid(recordId)) {
                    return res.status(400).json({
                        error: "A valid record ID is required",
                    });
                }

                if (action !== "accept" && action !== "reject") {
                    return res.status(400).json({
                        error: "Action must be accept or reject",
                    });
                }

                const nextStatus =
                    action === "accept" ? "accepted" : "rejected";

                const result = await pool.query(
                    `
                    UPDATE ${table}
                    SET verification_status = $1,
                        updated_at = now()
                    WHERE id = $2
                      AND home_id = $3
                      AND verification_status = 'proposed'
                    RETURNING *
                    `,
                    [nextStatus, recordId, homeId]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Proposed record not found",
                    });
                }

                return res.json({
                    action,
                    kind,
                    record: result.rows[0],
                });
            } catch (error) {
                console.error("Error updating proposal:", error);
                return res.status(500).json({
                    error: "Failed to update proposal",
                });
            }
        }
    );

    router.post(
        "/homes/:homeId/proposals/accept-all",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const updated = {};

                for (const [kind, table] of Object.entries(
                    RECORD_TABLES
                )) {
                    const result = await pool.query(
                        `
                        UPDATE ${table}
                        SET verification_status = 'accepted',
                            updated_at = now()
                        WHERE home_id = $1
                          AND verification_status = 'proposed'
                        RETURNING id
                        `,
                        [homeId]
                    );
                    updated[kind] = result.rows.length;
                }

                return res.json({ accepted: updated });
            } catch (error) {
                console.error("Error accepting proposals:", error);
                return res.status(500).json({
                    error: "Failed to accept proposals",
                });
            }
        }
    );

    return router;
}
