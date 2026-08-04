// backend/ownership.js

import {
    getAuthenticatedUserId,
} from "./auth.js";

import { pool } from "../db/pool.js";

import {
    isValidUuid,
} from "../lib/validation.js";

// ---------------------------------------------------------
// HOME OWNERSHIP AUTHORIZATION
// ---------------------------------------------------------
//
// Confirms the authenticated Auth0 user owns the home
// identified by :homeId before a route handler runs.
//
// Missing or other-user homes both return 404 so home
// existence is not leaked across accounts.
//
export async function requireHomeOwnership(
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

        const ownerAuth0Id =
            getAuthenticatedUserId(req);

        const result = await pool.query(
            `
            SELECT
                id,
                owner_auth0_id
            FROM homes
            WHERE id = $1
              AND owner_auth0_id = $2
            LIMIT 1
            `,
            [homeId, ownerAuth0Id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error:
                    "Home not found",
            });
        }

        req.authorizedHomeId =
            result.rows[0].id;

        return next();
    } catch (error) {
        console.error(
            "Home ownership check failed:",
            error
        );

        return res.status(500).json({
            error:
                "Could not verify home access",
        });
    }
}

// Compatibility shim for routes that already take a role
// option (e.g. needs board). Full membership roles land with
// household sharing; until then every caller must own the home.
export function requireHomeAccess(_options = {}) {
    return requireHomeOwnership;
}

// ---------------------------------------------------------
// DOCUMENT OWNERSHIP AUTHORIZATION
// ---------------------------------------------------------
//
// Document routes use:
//
// :documentId
//
// rather than:
//
// :homeId
//
// Therefore, we cannot check home ownership directly from
// the URL. We must:
//
// 1. Find the document.
// 2. Join it to its home.
// 3. Confirm that home belongs to the authenticated user.
//
// This middleware must run after requireAuth.
//
export async function requireDocumentOwnership(
    req,
    res,
    next
) {
    try {
        const { documentId } =
            req.params;

        // Reject malformed IDs before querying CockroachDB.
        if (!isValidUuid(documentId)) {
            return res.status(400).json({
                error:
                    "A valid document ID is required",
            });
        }

        // Read the stable Auth0 subject from the already
        // validated access token.
        //
        // Example:
        //
        // google-oauth2|111906979750891104809
        //
        const ownerAuth0Id =
            getAuthenticatedUserId(req);

        // Return the document only when its parent home
        // belongs to the authenticated user.
        //
        const result =
            await pool.query(
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
                [
                    documentId,
                    ownerAuth0Id,
                ]
            );

        // Use the same response whether:
        //
        // - the document does not exist
        // - its home does not exist
        // - it belongs to another user
        //
        // This prevents HouseIQ from revealing whether
        // another user's private document exists.
        //
        if (result.rows.length === 0) {
            return res.status(404).json({
                error:
                    "Document not found",
            });
        }

        // Save the verified document on the request.
        //
        // The download and delete handlers can use this
        // object instead of performing another unrestricted
        // document lookup.
        //
        req.authorizedDocument =
            result.rows[0];

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
