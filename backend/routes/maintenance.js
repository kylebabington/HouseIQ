// backend/routes/maintenance.js

import { Router } from "express";

import { requireAuth, getAuthenticatedUserId } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import {
    requireHomeAccess,
    requireHomeOwnership,
} from "../middleware/ownership.js";
import { isValidUuid } from "../lib/validation.js";

export function createMaintenanceRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/maintenance-events",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const result = await pool.query(
                    `
                    SELECT *
                    FROM maintenance_events
                    WHERE home_id = $1
                    ORDER BY COALESCE(completed_at, created_at::date) DESC
                    `,
                    [homeId]
                );
                return res.json(result.rows);
            } catch (error) {
                console.error(
                    "Error listing maintenance events:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to list maintenance events",
                });
            }
        }
    );

    router.post(
        "/homes/:homeId/maintenance-events",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const auth0Id = getAuthenticatedUserId(req);
                const {
                    assetId = null,
                    eventType = "service",
                    completedAt = null,
                    nextDueAt = null,
                    contractor = "",
                    cost = null,
                    notes = "",
                    sourceDocumentId = null,
                } = req.body || {};

                if (assetId && !isValidUuid(assetId)) {
                    return res.status(400).json({
                        error: "assetId must be a valid UUID",
                    });
                }

                const result = await pool.query(
                    `
                    INSERT INTO maintenance_events (
                        home_id,
                        asset_id,
                        event_type,
                        completed_at,
                        next_due_at,
                        contractor,
                        cost,
                        notes,
                        source_document_id,
                        created_by,
                        verification_status
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'accepted'
                    )
                    RETURNING *
                    `,
                    [
                        homeId,
                        assetId,
                        String(eventType || "service").slice(0, 80),
                        completedAt || null,
                        nextDueAt || null,
                        String(contractor || "").slice(0, 200),
                        cost,
                        String(notes || "").slice(0, 5000),
                        sourceDocumentId,
                        auth0Id,
                    ]
                );

                return res.status(201).json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error creating maintenance event:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to create maintenance event",
                });
            }
        }
    );

    return router;
}
