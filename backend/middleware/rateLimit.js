// backend/middleware/rateLimit.js

import rateLimit from "express-rate-limit";

// ---------------------------------------------------------
// RATE LIMIT KEY GENERATOR
// ---------------------------------------------------------
//
// Applied AFTER requireAuth, so req.auth is normally populated
// and we can key the limit on the stable Auth0 subject instead
// of the caller's IP address. Falling back to req.ip keeps this
// middleware safe to use even if auth is somehow not yet applied.
function keyByAuthenticatedUserOrIp(req) {
    return req.auth?.payload?.sub || req.ip;
}

// Disabling rate limiting during automated tests keeps the test
// suite fast and prevents shared limiter state from flaking
// unrelated tests that reuse the same user or IP.
function skipInTestEnvironment() {
    return process.env.NODE_ENV === "test";
}

// ---------------------------------------------------------
// ASK RATE LIMIT
// ---------------------------------------------------------
//
// Protects the HouseIQ agent endpoint, which triggers an OpenAI
// embedding call plus a chat completion on every request.
export const askRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByAuthenticatedUserOrIp,
    skip: skipInTestEnvironment,
    message: {
        error:
            "Too many questions sent to HouseIQ. Please try again in a few minutes.",
    },
});

// ---------------------------------------------------------
// UPLOAD RATE LIMIT
// ---------------------------------------------------------
//
// Protects the document upload endpoint, which triggers text
// extraction, an OpenAI analysis call, and an S3 upload.
export const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByAuthenticatedUserOrIp,
    skip: skipInTestEnvironment,
    message: {
        error:
            "Too many documents uploaded. Please try again in a few minutes.",
    },
});
