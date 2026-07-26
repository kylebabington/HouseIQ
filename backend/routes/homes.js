// backend/routes/homes.js

import {
    Router,
} from "express";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

export function createHomesRouter() {
    const router = Router();

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
    router.get(
        "/auth/me",

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
    router.post(
        "/homes",
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
    router.get(
        "/homes",
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

    return router;
}
