// backend/homeProfile.js

// ---------------------------------------------------------
// HOME PROFILE CONFIGURATION
// ---------------------------------------------------------
//
// The client uses camelCase field names while CockroachDB
// uses snake_case column names.
//
// This allowlist performs three jobs:
//
// 1. Defines which profile fields clients may edit.
// 2. Maps API names to database column names.
// 3. Prevents arbitrary SQL column injection.
//
export const HOME_PROFILE_FIELDS = {
    propertyType:
        "property_type",

    squareFeet:
        "square_feet",

    bedrooms:
        "bedrooms",

    fullBathrooms:
        "full_bathrooms",

    halfBathrooms:
        "half_bathrooms",

    stories:
        "stories",

    foundationType:
        "foundation_type",

    basementType:
        "basement_type",

    exteriorMaterial:
        "exterior_material",

    roofMaterial:
        "roof_material",

    heatingType:
        "heating_type",

    coolingType:
        "cooling_type",

    waterHeaterType:
        "water_heater_type",

    waterSource:
        "water_source",

    sewerType:
        "sewer_type",

    electricalServiceAmps:
        "electrical_service_amps",

    garageType:
        "garage_type",

    garageSpaces:
        "garage_spaces",

    lotSizeAcres:
        "lot_size_acres",

    onboardingStatus:
        "onboarding_status",

    onboardingStep:
        "onboarding_step",
};


// String fields that may contain controlled labels such as:
//
// central_air
// crawl_space
// asphalt_shingle
//
const HOME_PROFILE_STRING_FIELDS =
    new Set([
        "propertyType",
        "foundationType",
        "basementType",
        "exteriorMaterial",
        "roofMaterial",
        "heatingType",
        "coolingType",
        "waterHeaterType",
        "waterSource",
        "sewerType",
        "garageType",
        "onboardingStatus",
        "onboardingStep",
    ]);


// Fields that must contain whole numbers.
const HOME_PROFILE_INTEGER_FIELDS =
    new Set([
        "squareFeet",
        "bedrooms",
        "fullBathrooms",
        "halfBathrooms",
        "electricalServiceAmps",
        "garageSpaces",
    ]);


// Decimal fields may contain fractional values such as:
//
// stories: 1.5
// lotSizeAcres: 0.25
//
const HOME_PROFILE_DECIMAL_FIELDS =
    new Set([
        "stories",
        "lotSizeAcres",
    ]);


// Only these onboarding states may be written.
const VALID_ONBOARDING_STATUSES =
    new Set([
        "not_started",
        "in_progress",
        "completed",
    ]);

// ---------------------------------------------------------
// HOME PROFILE VALIDATION
// ---------------------------------------------------------

/**
 * Validates and normalizes one editable profile value.
 *
 * A return value of null is allowed for most fields so users
 * can clear a previously saved value. onboardingStatus is
 * NOT NULL in the database, so null / blank values are rejected.
 */
export function validateHomeProfileValue(
    fieldName,
    rawValue
) {
    // Null explicitly clears nullable fields.
    // onboarding_status is NOT NULL, so clearing it would
    // fail at the database and surface as a 500.
    if (
        rawValue === null
    ) {
        if (
            fieldName ===
            "onboardingStatus"
        ) {
            return {
                valid: false,
                error:
                    "onboardingStatus must be not_started, in_progress, or completed",
            };
        }

        return {
            valid: true,
            value: null,
        };
    }


    // -----------------------------------------------------
    // STRING FIELDS
    // -----------------------------------------------------

    if (
        HOME_PROFILE_STRING_FIELDS.has(
            fieldName
        )
    ) {
        if (
            typeof rawValue !==
            "string"
        ) {
            return {
                valid: false,
                error:
                    fieldName ===
                        "onboardingStatus"
                        ? "onboardingStatus must be not_started, in_progress, or completed"
                        : `${fieldName} must be a string or null`,
            };
        }

        const value =
            rawValue.trim();

        // Empty strings are normalized to null rather than
        // storing meaningless whitespace — except
        // onboardingStatus, which cannot be null.
        if (!value) {
            if (
                fieldName ===
                "onboardingStatus"
            ) {
                return {
                    valid: false,
                    error:
                        "onboardingStatus must be not_started, in_progress, or completed",
                };
            }

            return {
                valid: true,
                value: null,
            };
        }

        if (
            value.length > 100
        ) {
            return {
                valid: false,
                error:
                    `${fieldName} must be 100 characters or fewer`,
            };
        }

        if (
            fieldName ===
            "onboardingStatus"
        ) {
            if (
                !VALID_ONBOARDING_STATUSES.has(
                    value
                )
            ) {
                return {
                    valid: false,
                    error:
                        "onboardingStatus must be not_started, in_progress, or completed",
                };
            }
        }

        return {
            valid: true,
            value,
        };
    }


    // -----------------------------------------------------
    // INTEGER FIELDS
    // -----------------------------------------------------

    if (
        HOME_PROFILE_INTEGER_FIELDS.has(
            fieldName
        )
    ) {
        const value =
            Number(rawValue);

        if (
            !Number.isInteger(value)
        ) {
            return {
                valid: false,
                error:
                    `${fieldName} must be a whole number or null`,
            };
        }

        const fieldsThatAllowZero =
            new Set([
                "bedrooms",
                "fullBathrooms",
                "halfBathrooms",
                "garageSpaces",
            ]);

        if (
            fieldsThatAllowZero.has(
                fieldName
            )
        ) {
            if (value < 0) {
                return {
                    valid: false,
                    error:
                        `${fieldName} cannot be negative`,
                };
            }
        } else if (
            value <= 0
        ) {
            return {
                valid: false,
                error:
                    `${fieldName} must be greater than zero`,
            };
        }

        return {
            valid: true,
            value,
        };
    }


    // -----------------------------------------------------
    // DECIMAL FIELDS
    // -----------------------------------------------------

    if (
        HOME_PROFILE_DECIMAL_FIELDS.has(
            fieldName
        )
    ) {
        const value =
            Number(rawValue);

        if (
            !Number.isFinite(value) ||
            value <= 0
        ) {
            return {
                valid: false,
                error:
                    `${fieldName} must be a number greater than zero or null`,
            };
        }

        return {
            valid: true,
            value,
        };
    }


    return {
        valid: false,
        error:
            `${fieldName} is not an editable home-profile field`,
    };
}


/**
 * Converts a CockroachDB profile row into the camelCase shape
 * expected by the React frontend.
 *
 * When no profile record exists, the supplied row may contain
 * null profile fields from the LEFT JOIN.
 */
export function formatHomeProfile(
    row
) {
    return {
        homeId:
            row.home_id,

        homeName:
            row.home_name,

        yearBuilt:
            row.year_built,

        propertyType:
            row.property_type,

        squareFeet:
            row.square_feet,

        bedrooms:
            row.bedrooms,

        fullBathrooms:
            row.full_bathrooms,

        halfBathrooms:
            row.half_bathrooms,

        stories:
            row.stories === null ||
                row.stories === undefined
                ? null
                : Number(
                    row.stories
                ),

        foundationType:
            row.foundation_type,

        basementType:
            row.basement_type,

        exteriorMaterial:
            row.exterior_material,

        roofMaterial:
            row.roof_material,

        heatingType:
            row.heating_type,

        coolingType:
            row.cooling_type,

        waterHeaterType:
            row.water_heater_type,

        waterSource:
            row.water_source,

        sewerType:
            row.sewer_type,

        electricalServiceAmps:
            row.electrical_service_amps,

        garageType:
            row.garage_type,

        garageSpaces:
            row.garage_spaces,

        lotSizeAcres:
            row.lot_size_acres === null ||
                row.lot_size_acres === undefined
                ? null
                : Number(
                    row.lot_size_acres
                ),

        onboardingStatus:
            row.onboarding_status ||
            "not_started",

        onboardingStep:
            row.onboarding_step,

        metadata:
            row.metadata || {},

        profileCreatedAt:
            row.profile_created_at,

        profileUpdatedAt:
            row.profile_updated_at,
    };
}
