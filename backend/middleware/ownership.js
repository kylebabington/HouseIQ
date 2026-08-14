// backend/middleware/ownership.js

import {
    getAuthenticatedUserId,
} from "./auth.js";

import { pool } from "../db/pool.js";

import {
    isValidUuid,
} from "../lib/validation.js";

const ROLE_RANK = {
    viewer: 1,
    member: 2,
    owner: 3,
};

/**
 * Resolves the caller's role on a home via home_members,
 * falling back to homes.owner_auth0_id for legacy rows.
 */
export async function resolveHomeMembership(
    homeId,
    auth0Id
) {
    try {
        const memberResult = await pool.query(
            `
            SELECT role
            FROM home_members
            WHERE home_id = $1
              AND member_auth0_id = $2
            LIMIT 1
            `,
            [homeId, auth0Id]
        );

        if (memberResult.rows.length > 0) {
            return memberResult.rows[0].role;
        }
    } catch (error) {
        // Older DBs / test fakes may not implement home_members yet.
        console.warn(
            "home_members lookup failed; falling back to owner check:",
            error.message
        );
    }

    try {
        const ownerResult = await pool.query(
            `
            SELECT id, owner_auth0_id
            FROM homes
            WHERE id = $1
              AND owner_auth0_id = $2
            LIMIT 1
            `,
            [homeId, auth0Id]
        );

        if (ownerResult.rows.length > 0) {
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
                    [homeId, auth0Id]
                );
            } catch (error) {
                console.warn(
                    "Could not sync owner into home_members:",
                    error.message
                );
            }

            return "owner";
        }
    } catch (error) {
        console.warn(
            "Owner fallback lookup failed:",
            error.message
        );
    }

    return null;
}

/**
 * Factory: require at least minRole on the home.
 * Missing / unauthorized homes → 404 (no existence leak).
 */
export function requireHomeAccess({
    minRole = "viewer",
} = {}) {
    const needed = ROLE_RANK[minRole] || 1;

    return async function homeAccessMiddleware(
        req,
        res,
        next
    ) {
        try {
            const { homeId } = req.params;

            if (!isValidUuid(homeId)) {
                return res.status(400).json({
                    error:
                        "A valid home ID is required",
                });
            }

            const auth0Id =
                getAuthenticatedUserId(req);

            const role = await resolveHomeMembership(
                homeId,
                auth0Id
            );

            if (!role) {
                return res.status(404).json({
                    error: "Home not found",
                });
            }

            if ((ROLE_RANK[role] || 0) < needed) {
                return res.status(403).json({
                    error:
                        "You do not have permission for this action",
                });
            }

            req.authorizedHomeId = homeId;
            req.homeMemberRole = role;

            return next();
        } catch (error) {
            console.error(
                "Home access check failed:",
                error
            );

            return res.status(500).json({
                error:
                    "Could not verify home access",
            });
        }
    };
}

/**
 * Backward-compatible alias: treat as member+ access
 * (historical "ownership" gates for writes).
 */
export async function requireHomeOwnership(
    req,
    res,
    next
) {
    return requireHomeAccess({ minRole: "member" })(
        req,
        res,
        next
    );
}

/**
 * Document access via parent home membership (viewer+),
 * with owner_auth0_id fallback for legacy rows / tests.
 */
export async function requireDocumentOwnership(
    req,
    res,
    next
) {
    try {
        const { documentId } = req.params;

        if (!isValidUuid(documentId)) {
            return res.status(400).json({
                error:
                    "A valid document ID is required",
            });
        }

        const auth0Id =
            getAuthenticatedUserId(req);

        // Prefer membership-aware lookup; fall back to
        // classic owner join if home_members is unavailable.
        let result;

        try {
            result = await pool.query(
                `
                SELECT
                    documents.id,
                    documents.home_id,
                    documents.document_type,
                    documents.file_name,
                    documents.source_url,
                    documents.metadata,
                    documents.created_at,
                    documents.updated_at
                FROM documents
                INNER JOIN homes
                    ON homes.id =
                        documents.home_id
                LEFT JOIN home_members
                    ON home_members.home_id =
                        documents.home_id
                   AND home_members.member_auth0_id = $2
                WHERE documents.id = $1
                  AND (
                        homes.owner_auth0_id = $2
                     OR home_members.member_auth0_id = $2
                  )
                LIMIT 1
                `,
                [documentId, auth0Id]
            );
        } catch (error) {
            result = await pool.query(
                `
                SELECT
                    documents.id,
                    documents.home_id,
                    documents.document_type,
                    documents.file_name,
                    documents.source_url,
                    documents.metadata,
                    documents.created_at,
                    documents.updated_at

                FROM documents

                INNER JOIN homes
                    ON homes.id =
                        documents.home_id

                WHERE documents.id = $1
                  AND homes.owner_auth0_id = $2

                LIMIT 1
                `,
                [documentId, auth0Id]
            );
        }

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Document not found",
            });
        }

        const document = result.rows[0];

        // Fail closed: never default to owner. Write gates
        // (delete, etc.) must see a verified role or deny.
        let role;

        try {
            role = await resolveHomeMembership(
                document.home_id,
                auth0Id
            );
        } catch (error) {
            console.error(
                "Could not resolve document member role:",
                error
            );

            return res.status(500).json({
                error:
                    "Could not verify document permissions",
            });
        }

        if (!role) {
            return res.status(403).json({
                error:
                    "You do not have permission for this action",
            });
        }

        req.authorizedDocument = document;
        req.authorizedHomeId = document.home_id;
        req.homeMemberRole = role;

        return next();
    } catch (error) {
        console.error(
            "Document ownership check failed:",
            error
        );

        return res.status(500).json({
            error:
                "Could not verify document access",
        });
    }
}

/**
 * Document write/delete requires member+.
 */
export function requireDocumentWriteAccess(
    req,
    res,
    next
) {
    return requireDocumentOwnership(
        req,
        res,
        (err) => {
            if (err) {
                return next(err);
            }

            const rank =
                ROLE_RANK[req.homeMemberRole] || 0;

            if (rank < ROLE_RANK.member) {
                return res.status(403).json({
                    error:
                        "You do not have permission for this action",
                });
            }

            return next();
        }
    );
}
