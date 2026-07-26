// backend/validation.js

// ---------------------------------------------------------
// UUID VALIDATION
// ---------------------------------------------------------
//
// HouseIQ uses UUID primary keys for homes, documents,
// memories, issues, projects, assets, and other records.
//
// Validating URL parameters before sending them to
// CockroachDB prevents malformed IDs from producing
// avoidable database errors.
//
export function isValidUuid(value) {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return false;
    }

    // Accepts standard UUID versions 1 through 5.
    //
    // Example:
    //
    // 550e8400-e29b-41d4-a716-446655440000
    //
    const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return uuidPattern.test(
        value.trim()
    );
}
