// backend/routes/homes.js

import {
    Router,
} from "express";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireHomeAccess,
} from "../middleware/ownership.js";

import {
    isValidUuid,
} from "../lib/validation.js";

export function createHomesRouter() {
    const router = Router();

    router.get(
        "/auth/me",
        requireAuth,
        (req, res) => {
            const auth0UserId =
                getAuthenticatedUserId(req);

            const claims =
                req.auth.payload || {};

            return res.json({
                sub: auth0UserId,
                email: claims.email || null,
                name: claims.name || null,
            });
        }
    );

    router.post(
        "/homes",
        requireAuth,
        async (req, res) => {
            try {
                const { name, yearBuilt, notes } =
                    req.body;

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
                        owner_auth0_id,
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

                const home = result.rows[0];

                try {
                    await pool.query(
                        `
                        INSERT INTO home_members (
                            home_id,
                            member_auth0_id,
                            role
                        )
                        VALUES ($1, $2, 'owner')
                        ON CONFLICT DO NOTHING
                        `,
                        [home.id, ownerAuth0Id]
                    );
                } catch (memberError) {
                    console.warn(
                        "Could not seed home_members for new home:",
                        memberError.message
                    );
                }

                res.status(201).json(home);
            } catch (error) {
                console.error("Error creating home:", error);
                res.status(500).json({
                    error: "Failed to create home",
                });
            }
        }
    );

    router.get(
        "/homes",
        requireAuth,
        async (req, res) => {
            try {
                const auth0Id =
                    getAuthenticatedUserId(req);

                let result;

                try {
                    result = await pool.query(
                        `
                SELECT DISTINCT
                    homes.id,
                    homes.name,
                    homes.year_built,
                    homes.notes,
                    homes.owner_auth0_id,
                    homes.created_at,
                    homes.updated_at,
                    COALESCE(
                        home_members.role,
                        CASE
                            WHEN homes.owner_auth0_id = $1
                            THEN 'owner'
                            ELSE NULL
                        END
                    ) AS member_role
                FROM homes
                LEFT JOIN home_members
                    ON home_members.home_id = homes.id
                   AND home_members.member_auth0_id = $1
                WHERE homes.owner_auth0_id = $1
                   OR home_members.member_auth0_id = $1
                ORDER BY homes.created_at DESC
                `,
                        [auth0Id]
                    );
                } catch (error) {
                    result = await pool.query(
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
                        [auth0Id]
                    );
                }

                res.json(result.rows);
            } catch (error) {
                console.error("Error fetching homes:", error);
                res.status(500).json({
                    error: "Failed to fetch homes",
                });
            }
        }
    );

    router.patch(
        "/homes/:homeId",
        requireAuth,
        requireHomeAccess({ minRole: "member" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { name, yearBuilt, notes } =
                    req.body || {};

                const updates = [];
                const values = [];
                let index = 1;

                if (typeof name === "string") {
                    const safeName = name.trim();
                    if (!safeName) {
                        return res.status(400).json({
                            error: "Home name cannot be empty",
                        });
                    }
                    updates.push(`name = $${index++}`);
                    values.push(safeName);
                }

                if (yearBuilt !== undefined) {
                    updates.push(
                        `year_built = $${index++}`
                    );
                    values.push(
                        yearBuilt === null || yearBuilt === ""
                            ? null
                            : yearBuilt
                    );
                }

                if (typeof notes === "string") {
                    updates.push(`notes = $${index++}`);
                    values.push(notes.trim());
                }

                if (updates.length === 0) {
                    return res.status(400).json({
                        error: "No valid home fields to update",
                    });
                }

                updates.push("updated_at = now()");
                values.push(homeId);

                const result = await pool.query(
                    `
                    UPDATE homes
                    SET ${updates.join(", ")}
                    WHERE id = $${index}
                    RETURNING
                        id,
                        name,
                        year_built,
                        notes,
                        owner_auth0_id,
                        created_at,
                        updated_at
                    `,
                    values
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Home not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error("Error updating home:", error);
                return res.status(500).json({
                    error: "Failed to update home",
                });
            }
        }
    );

    router.delete(
        "/homes/:homeId",
        requireAuth,
        requireHomeAccess({ minRole: "owner" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
                    `
                    DELETE FROM homes
                    WHERE id = $1
                    RETURNING id
                    `,
                    [homeId]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Home not found",
                    });
                }

                return res.json({
                    success: true,
                    id: homeId,
                });
            } catch (error) {
                console.error("Error deleting home:", error);
                return res.status(500).json({
                    error: "Failed to delete home",
                });
            }
        }
    );

    // ---------------------------------------------------------
    // HOUSEHOLD MEMBERS
    // ---------------------------------------------------------

    router.get(
        "/homes/:homeId/members",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
                    `
                    SELECT
                        home_id,
                        member_auth0_id,
                        role,
                        invited_email,
                        created_at
                    FROM home_members
                    WHERE home_id = $1
                    ORDER BY
                        CASE role
                            WHEN 'owner' THEN 0
                            WHEN 'member' THEN 1
                            ELSE 2
                        END,
                        created_at ASC
                    `,
                    [homeId]
                );

                return res.json(result.rows);
            } catch (error) {
                console.error(
                    "Error listing members:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to list members",
                });
            }
        }
    );

    router.post(
        "/homes/:homeId/members",
        requireAuth,
        requireHomeAccess({ minRole: "owner" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const {
                    memberAuth0Id,
                    invitedEmail,
                    role = "member",
                } = req.body || {};

                const safeRole =
                    role === "viewer" || role === "member"
                        ? role
                        : "member";

                const safeEmail =
                    typeof invitedEmail === "string"
                        ? invitedEmail.trim().toLowerCase()
                        : null;

                const safeMemberId =
                    typeof memberAuth0Id === "string"
                        ? memberAuth0Id.trim()
                        : null;

                if (!safeMemberId && !safeEmail) {
                    return res.status(400).json({
                        error:
                            "Provide memberAuth0Id or invitedEmail",
                    });
                }

                // Pending invite: store email with a placeholder
                // member id until redeem attaches the real sub.
                const memberId =
                    safeMemberId ||
                    `pending|${safeEmail}`;

                const result = await pool.query(
                    `
                    INSERT INTO home_members (
                        home_id,
                        member_auth0_id,
                        role,
                        invited_email
                    )
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (home_id, member_auth0_id)
                    DO UPDATE SET
                        role = EXCLUDED.role,
                        invited_email = COALESCE(
                            EXCLUDED.invited_email,
                            home_members.invited_email
                        )
                    RETURNING *
                    `,
                    [
                        homeId,
                        memberId,
                        safeRole,
                        safeEmail,
                    ]
                );

                return res.status(201).json(
                    result.rows[0]
                );
            } catch (error) {
                console.error(
                    "Error inviting member:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to invite member",
                });
            }
        }
    );

    router.delete(
        "/homes/:homeId/members/:memberAuth0Id",
        requireAuth,
        requireHomeAccess({ minRole: "owner" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { memberAuth0Id } = req.params;

                if (!memberAuth0Id) {
                    return res.status(400).json({
                        error: "Member ID is required",
                    });
                }

                const target = await pool.query(
                    `
                    SELECT role
                    FROM home_members
                    WHERE home_id = $1
                      AND member_auth0_id = $2
                    LIMIT 1
                    `,
                    [homeId, memberAuth0Id]
                );

                if (target.rows.length === 0) {
                    return res.status(404).json({
                        error: "Member not found",
                    });
                }

                if (target.rows[0].role === "owner") {
                    return res.status(400).json({
                        error:
                            "Cannot remove the home owner from members",
                    });
                }

                await pool.query(
                    `
                    DELETE FROM home_members
                    WHERE home_id = $1
                      AND member_auth0_id = $2
                    `,
                    [homeId, memberAuth0Id]
                );

                return res.json({
                    success: true,
                    memberAuth0Id,
                });
            } catch (error) {
                console.error(
                    "Error removing member:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to remove member",
                });
            }
        }
    );

    // Redeem pending email invites for the signed-in user.
    router.post(
        "/homes/members/redeem",
        requireAuth,
        async (req, res) => {
            try {
                const auth0Id =
                    getAuthenticatedUserId(req);
                const claims =
                    req.auth.payload || {};
                const email =
                    typeof claims.email === "string"
                        ? claims.email.trim().toLowerCase()
                        : null;

                if (!email) {
                    return res.status(400).json({
                        error:
                            "Your access token does not include an email claim",
                    });
                }

                const pendingKey = `pending|${email}`;

                const pending = await pool.query(
                    `
                    SELECT home_id, role, invited_email
                    FROM home_members
                    WHERE member_auth0_id = $1
                       OR (
                            invited_email = $2
                        AND member_auth0_id LIKE 'pending|%'
                       )
                    `,
                    [pendingKey, email]
                );

                const redeemed = [];

                for (const row of pending.rows) {
                    await pool.query(
                        `
                        INSERT INTO home_members (
                            home_id,
                            member_auth0_id,
                            role,
                            invited_email
                        )
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (home_id, member_auth0_id)
                        DO UPDATE SET
                            role = EXCLUDED.role,
                            invited_email = EXCLUDED.invited_email
                        `,
                        [
                            row.home_id,
                            auth0Id,
                            row.role === "owner"
                                ? "member"
                                : row.role,
                            email,
                        ]
                    );

                    await pool.query(
                        `
                        DELETE FROM home_members
                        WHERE home_id = $1
                          AND member_auth0_id = $2
                        `,
                        [row.home_id, pendingKey]
                    );

                    redeemed.push(row.home_id);
                }

                return res.json({
                    redeemedHomeIds: redeemed,
                });
            } catch (error) {
                console.error(
                    "Error redeeming invites:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to redeem invites",
                });
            }
        }
    );

    return router;
}
