// backend/auth.js

import {
    auth,
} from "express-oauth2-jwt-bearer";


// ---------------------------------------------------------
// AUTH0 CONFIGURATION
// ---------------------------------------------------------

const AUTH0_DOMAIN =
    process.env.AUTH0_DOMAIN;

const AUTH0_AUDIENCE =
    process.env.AUTH0_AUDIENCE;


// ---------------------------------------------------------
// CONFIGURATION VALIDATION
// ---------------------------------------------------------

if (!AUTH0_DOMAIN) {
    throw new Error(
        "AUTH0_DOMAIN is required"
    );
}

if (!AUTH0_AUDIENCE) {
    throw new Error(
        "AUTH0_AUDIENCE is required"
    );
}


// ---------------------------------------------------------
// JWT VALIDATION MIDDLEWARE
// ---------------------------------------------------------
//
// This validates:
//
// - Auth0 signature
// - token issuer
// - token audience
// - token expiration
//
export const requireAuth =
    auth({
        issuerBaseURL:
            `https://${AUTH0_DOMAIN}`,

        audience:
            AUTH0_AUDIENCE,

        tokenSigningAlg:
            "RS256",
    });


// ---------------------------------------------------------
// GET THE AUTHENTICATED USER ID
// ---------------------------------------------------------

export function getAuthenticatedUserId(
    req
) {
    const userId =
        req.auth?.payload?.sub;

    if (!userId) {
        throw new Error(
            "Authenticated token is missing a subject"
        );
    }

    return userId;
}