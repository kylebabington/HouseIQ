// backend/routes/profile.js

import {
    Router,
} from "express";

import {
    requireAuth,
} from "../auth.js";

import { pool } from "../db.js";

import {
    formatHomeProfile,
    HOME_PROFILE_FIELDS,
    validateHomeProfileValue,
} from "../homeProfile.js";

import {
    requireHomeOwnership,
} from "../ownership.js";

export function createProfileRouter() {
    const router = Router();

    // ---------------------------------------------------------
    // GET HOME PROFILE
    // ---------------------------------------------------------
    //
    // Returns the structured profile for one authorized home.
    //
    // A LEFT JOIN is used because older homes may not have a
    // home_profiles record yet.
    //
    // In that case, the endpoint still returns a complete response
    // with null profile fields and onboardingStatus not_started.
    //
    router.get(
        "/homes/:homeId/profile",

        requireAuth,
        requireHomeOwnership,

        async (req, res) => {
            try {
                const homeId =
                    req.authorizedHomeId;

                const result =
                    await pool.query(
                        `
                        SELECT
                            homes.id
                                AS home_id,

                            homes.name
                                AS home_name,

                            homes.year_built,

                            home_profiles.property_type,
                            home_profiles.square_feet,
                            home_profiles.bedrooms,
                            home_profiles.full_bathrooms,
                            home_profiles.half_bathrooms,
                            home_profiles.stories,

                            home_profiles.foundation_type,
                            home_profiles.basement_type,
                            home_profiles.exterior_material,
                            home_profiles.roof_material,

                            home_profiles.heating_type,
                            home_profiles.cooling_type,
                            home_profiles.water_heater_type,
                            home_profiles.water_source,
                            home_profiles.sewer_type,
                            home_profiles.electrical_service_amps,

                            home_profiles.garage_type,
                            home_profiles.garage_spaces,
                            home_profiles.lot_size_acres,

                            home_profiles.onboarding_status,
                            home_profiles.onboarding_step,
                            home_profiles.metadata,

                            home_profiles.created_at
                                AS profile_created_at,

                            home_profiles.updated_at
                                AS profile_updated_at

                        FROM homes

                        LEFT JOIN home_profiles
                            ON home_profiles.home_id =
                                homes.id

                        WHERE homes.id = $1

                        LIMIT 1
                        `,
                        [
                            homeId,
                        ]
                    );

                // This should be unusual because ownership middleware
                // already verified the home. It protects against the
                // home being deleted between the middleware query and
                // this route query.
                if (
                    result.rows.length ===
                    0
                ) {
                    return res
                        .status(404)
                        .json({
                            error:
                                "Home not found",
                        });
                }

                return res.json(
                    formatHomeProfile(
                        result.rows[0]
                    )
                );
            } catch (error) {
                console.error(
                    "Error fetching home profile:",
                    error
                );

                return res
                    .status(500)
                    .json({
                        error:
                            "Failed to fetch home profile",
                    });
            }
        }
    );

    // ---------------------------------------------------------
    // PATCH HOME PROFILE
    // ---------------------------------------------------------
    //
    // Creates or partially updates the structured profile for an
    // authorized home.
    //
    // Only fields in HOME_PROFILE_FIELDS are accepted.
    //
    // The SQL column names come from our server-controlled
    // allowlist. They never come directly from request text.
    //
    router.patch(
        "/homes/:homeId/profile",

        requireAuth,
        requireHomeOwnership,

        async (req, res) => {
            try {
                const homeId =
                    req.authorizedHomeId;

                const requestBody =
                    req.body;

                if (
                    !requestBody ||
                    typeof requestBody !==
                    "object" ||
                    Array.isArray(
                        requestBody
                    )
                ) {
                    return res
                        .status(400)
                        .json({
                            error:
                                "A profile update object is required",
                        });
                }


                const requestEntries =
                    Object.entries(
                        requestBody
                    );

                if (
                    requestEntries.length ===
                    0
                ) {
                    return res
                        .status(400)
                        .json({
                            error:
                                "At least one profile field is required",
                        });
                }


                const normalizedUpdates =
                    [];

                const validationErrors =
                    {};


                for (
                    const [
                        fieldName,
                        rawValue,
                    ] of requestEntries
                ) {
                    const databaseColumn =
                        HOME_PROFILE_FIELDS[
                        fieldName
                        ];

                    if (
                        !databaseColumn
                    ) {
                        validationErrors[
                            fieldName
                        ] =
                            "This field cannot be updated";

                        continue;
                    }

                    const validation =
                        validateHomeProfileValue(
                            fieldName,
                            rawValue
                        );

                    if (
                        !validation.valid
                    ) {
                        validationErrors[
                            fieldName
                        ] =
                            validation.error;

                        continue;
                    }

                    normalizedUpdates.push({
                        apiField:
                            fieldName,

                        databaseColumn,

                        value:
                            validation.value,
                    });
                }


                if (
                    Object.keys(
                        validationErrors
                    ).length > 0
                ) {
                    return res
                        .status(400)
                        .json({
                            error:
                                "Home profile validation failed",

                            fields:
                                validationErrors,
                        });
                }


                // Build:
                //
                // property_type = $2
                // square_feet = $3
                //
                // Column names are safe because they came from the
                // server-owned allowlist above.
                const insertColumns =
                    normalizedUpdates.map(
                        (update) =>
                            update.databaseColumn
                    );

                const values =
                    normalizedUpdates.map(
                        (update) =>
                            update.value
                    );

                const insertPlaceholders =
                    values.map(
                        (
                            value,
                            index
                        ) =>
                            `$${index + 2}`
                    );

                const conflictUpdates =
                    insertColumns.map(
                        (column) =>
                            `${column} = excluded.${column}`
                    );


                const result =
                    await pool.query(
                        `
                        INSERT INTO home_profiles (
                            home_id,
                            ${insertColumns.join(
                            ", "
                        )}
                        )
                        VALUES (
                            $1,
                            ${insertPlaceholders.join(
                            ", "
                        )}
                        )

                        ON CONFLICT (
                            home_id
                        )
                        DO UPDATE SET
                            ${conflictUpdates.join(
                            ", "
                        )},
                            updated_at = now()

                        RETURNING *
                        `,
                        [
                            homeId,
                            ...values,
                        ]
                    );


                const updatedProfile =
                    result.rows[0];


                // Read the home fields that belong to the main
                // homes table so the response matches GET /profile.
                const homeResult =
                    await pool.query(
                        `
                        SELECT
                            id,
                            name,
                            year_built
                        FROM homes
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [
                            homeId,
                        ]
                    );


                if (
                    homeResult.rows.length ===
                    0
                ) {
                    return res
                        .status(404)
                        .json({
                            error:
                                "Home not found",
                        });
                }


                const home =
                    homeResult.rows[0];


                return res.json(
                    formatHomeProfile({
                        home_id:
                            home.id,

                        home_name:
                            home.name,

                        year_built:
                            home.year_built,

                        ...updatedProfile,

                        profile_created_at:
                            updatedProfile
                                .created_at,

                        profile_updated_at:
                            updatedProfile
                                .updated_at,
                    })
                );
            } catch (error) {
                console.error(
                    "Error updating home profile:",
                    error
                );

                return res
                    .status(500)
                    .json({
                        error:
                            "Failed to update home profile",
                    });
            }
        }
    );

    return router;
}
