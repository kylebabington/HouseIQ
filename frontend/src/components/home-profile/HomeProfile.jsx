// frontend/src/components/home-profile/HomeProfile.jsx

import {
    useMemo,
    useState,
} from "react";

import HomeOnboarding from "./HomeOnboarding";

import "./HomeProfile.css";


// ---------------------------------------------------------
// EMPTY FORM STATE
// ---------------------------------------------------------
//
// React inputs should use empty strings instead of undefined
// or null. That keeps every field controlled from the first
// render.
//
const EMPTY_PROFILE_FORM = {
    propertyType: "",
    squareFeet: "",
    bedrooms: "",
    fullBathrooms: "",
    halfBathrooms: "",
    stories: "",

    foundationType: "",
    basementType: "",
    exteriorMaterial: "",
    roofMaterial: "",

    heatingType: "",
    coolingType: "",
    waterHeaterType: "",
    waterSource: "",
    sewerType: "",
    electricalServiceAmps: "",

    garageType: "",
    garageSpaces: "",
    lotSizeAcres: "",
};


// ---------------------------------------------------------
// PROFILE FIELD GROUPS
// ---------------------------------------------------------
//
// Keeping the field definitions in data makes the UI easier
// to extend later.
//
// The future onboarding agent can eventually reuse a similar
// field catalog when deciding which question to ask next.
//
const PROFILE_SECTIONS = [
    {
        id: "property",
        title: "Property",
        description:
            "Basic information about the size and layout of the home.",

        fields: [
            {
                name: "propertyType",
                label: "Property type",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "single_family",
                        label: "Single-family home",
                    },
                    {
                        value: "townhouse",
                        label: "Townhouse",
                    },
                    {
                        value: "condo",
                        label: "Condominium",
                    },
                    {
                        value: "duplex",
                        label: "Duplex",
                    },
                    {
                        value: "manufactured_home",
                        label: "Manufactured home",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "squareFeet",
                label: "Finished square feet",
                type: "number",
                minimum: 1,
                step: 1,
            },
            {
                name: "bedrooms",
                label: "Bedrooms",
                type: "number",
                minimum: 0,
                step: 1,
            },
            {
                name: "fullBathrooms",
                label: "Full bathrooms",
                type: "number",
                minimum: 0,
                step: 1,
            },
            {
                name: "halfBathrooms",
                label: "Half bathrooms",
                type: "number",
                minimum: 0,
                step: 1,
            },
            {
                name: "stories",
                label: "Stories",
                type: "number",
                minimum: 0.5,
                step: 0.5,
            },
        ],
    },

    {
        id: "structure",
        title: "Structure and exterior",
        description:
            "The major materials and structural characteristics of the home.",

        fields: [
            {
                name: "foundationType",
                label: "Foundation",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "slab",
                        label: "Concrete slab",
                    },
                    {
                        value: "crawl_space",
                        label: "Crawl space",
                    },
                    {
                        value: "basement",
                        label: "Basement",
                    },
                    {
                        value: "pier_and_beam",
                        label: "Pier and beam",
                    },
                    {
                        value: "mixed",
                        label: "Mixed",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "basementType",
                label: "Basement type",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown or none",
                    },
                    {
                        value: "none",
                        label: "No basement",
                    },
                    {
                        value: "unfinished",
                        label: "Unfinished",
                    },
                    {
                        value: "partially_finished",
                        label: "Partially finished",
                    },
                    {
                        value: "finished",
                        label: "Finished",
                    },
                    {
                        value: "walkout",
                        label: "Walkout",
                    },
                ],
            },
            {
                name: "exteriorMaterial",
                label: "Exterior or siding",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "vinyl",
                        label: "Vinyl siding",
                    },
                    {
                        value: "wood",
                        label: "Wood siding",
                    },
                    {
                        value: "fiber_cement",
                        label: "Fiber cement",
                    },
                    {
                        value: "brick",
                        label: "Brick",
                    },
                    {
                        value: "stone",
                        label: "Stone",
                    },
                    {
                        value: "stucco",
                        label: "Stucco",
                    },
                    {
                        value: "metal",
                        label: "Metal",
                    },
                    {
                        value: "mixed",
                        label: "Mixed materials",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "roofMaterial",
                label: "Roof material",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "asphalt_shingle",
                        label: "Asphalt shingles",
                    },
                    {
                        value: "metal",
                        label: "Metal",
                    },
                    {
                        value: "tile",
                        label: "Tile",
                    },
                    {
                        value: "slate",
                        label: "Slate",
                    },
                    {
                        value: "wood_shake",
                        label: "Wood shake",
                    },
                    {
                        value: "rubber_membrane",
                        label: "Rubber membrane",
                    },
                    {
                        value: "built_up",
                        label: "Built-up roof",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
        ],
    },

    {
        id: "systems",
        title: "Mechanical systems and utilities",
        description:
            "Heating, cooling, water, sewer, and electrical details.",

        fields: [
            {
                name: "heatingType",
                label: "Primary heating",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "gas_furnace",
                        label: "Gas furnace",
                    },
                    {
                        value: "electric_furnace",
                        label: "Electric furnace",
                    },
                    {
                        value: "heat_pump",
                        label: "Heat pump",
                    },
                    {
                        value: "boiler",
                        label: "Boiler",
                    },
                    {
                        value: "radiant",
                        label: "Radiant heat",
                    },
                    {
                        value: "baseboard",
                        label: "Baseboard heat",
                    },
                    {
                        value: "wood_stove",
                        label: "Wood stove",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "coolingType",
                label: "Cooling",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "central_air",
                        label: "Central air",
                    },
                    {
                        value: "heat_pump",
                        label: "Heat pump",
                    },
                    {
                        value: "mini_split",
                        label: "Mini-split",
                    },
                    {
                        value: "window_units",
                        label: "Window units",
                    },
                    {
                        value: "evaporative_cooler",
                        label: "Evaporative cooler",
                    },
                    {
                        value: "none",
                        label: "No cooling system",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "waterHeaterType",
                label: "Water heater",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "gas_tank",
                        label: "Gas tank",
                    },
                    {
                        value: "electric_tank",
                        label: "Electric tank",
                    },
                    {
                        value: "gas_tankless",
                        label: "Gas tankless",
                    },
                    {
                        value: "electric_tankless",
                        label: "Electric tankless",
                    },
                    {
                        value: "heat_pump",
                        label: "Heat-pump water heater",
                    },
                    {
                        value: "solar",
                        label: "Solar",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "waterSource",
                label: "Water source",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "municipal",
                        label: "Municipal water",
                    },
                    {
                        value: "private_well",
                        label: "Private well",
                    },
                    {
                        value: "shared_well",
                        label: "Shared well",
                    },
                    {
                        value: "cistern",
                        label: "Cistern",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "sewerType",
                label: "Wastewater",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown",
                    },
                    {
                        value: "municipal",
                        label: "Municipal sewer",
                    },
                    {
                        value: "septic",
                        label: "Septic system",
                    },
                    {
                        value: "shared_septic",
                        label: "Shared septic",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "electricalServiceAmps",
                label: "Electrical service amps",
                type: "number",
                minimum: 1,
                step: 1,
            },
        ],
    },

    {
        id: "site",
        title: "Garage and site",
        description:
            "Garage capacity and basic lot information.",

        fields: [
            {
                name: "garageType",
                label: "Garage type",
                type: "select",

                options: [
                    {
                        value: "",
                        label: "Unknown or none",
                    },
                    {
                        value: "none",
                        label: "No garage",
                    },
                    {
                        value: "attached",
                        label: "Attached",
                    },
                    {
                        value: "detached",
                        label: "Detached",
                    },
                    {
                        value: "carport",
                        label: "Carport",
                    },
                    {
                        value: "integral",
                        label: "Integral or basement garage",
                    },
                    {
                        value: "other",
                        label: "Other",
                    },
                ],
            },
            {
                name: "garageSpaces",
                label: "Garage spaces",
                type: "number",
                minimum: 0,
                step: 1,
            },
            {
                name: "lotSizeAcres",
                label: "Lot size (acres)",
                type: "number",
                minimum: 0.01,
                step: 0.01,
                unit: "acres",
            },
        ],
    },
];


// ---------------------------------------------------------
// DISPLAY HELPERS
// ---------------------------------------------------------

function formatLabel(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "Unknown";
    }

    return String(value)
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) =>
            letter.toUpperCase()
        );
}


function formatNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "Unknown";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return "Unknown";
    }

    return new Intl.NumberFormat(
        "en-US"
    ).format(number);
}


// ---------------------------------------------------------
// PROFILE CONVERSION HELPERS
// ---------------------------------------------------------

function createFormFromProfile(
    profile
) {
    if (!profile) {
        return {
            ...EMPTY_PROFILE_FORM,
        };
    }

    const form = {
        ...EMPTY_PROFILE_FORM,
    };

    for (
        const fieldName of Object.keys(
            EMPTY_PROFILE_FORM
        )
    ) {
        const value =
            profile[fieldName];

        form[fieldName] =
            value === null ||
                value === undefined
                ? ""
                : String(value);
    }

    return form;
}


/**
 * Converts browser form strings into the values expected by
 * the backend.
 *
 * Blank values become null so an existing value can be cleared.
 */
function createPatchPayload(
    form
) {
    const integerFields =
        new Set([
            "squareFeet",
            "bedrooms",
            "fullBathrooms",
            "halfBathrooms",
            "electricalServiceAmps",
            "garageSpaces",
        ]);

    const decimalFields =
        new Set([
            "stories",
            "lotSizeAcres",
        ]);

    const payload = {};

    for (
        const [
            fieldName,
            rawValue,
        ] of Object.entries(form)
    ) {
        const trimmedValue =
            typeof rawValue === "string"
                ? rawValue.trim()
                : rawValue;

        if (trimmedValue === "") {
            payload[fieldName] =
                null;

            continue;
        }

        if (
            integerFields.has(
                fieldName
            )
        ) {
            payload[fieldName] =
                Number.parseInt(
                    trimmedValue,
                    10
                );

            continue;
        }

        if (
            decimalFields.has(
                fieldName
            )
        ) {
            payload[fieldName] =
                Number.parseFloat(
                    trimmedValue
                );

            continue;
        }

        payload[fieldName] =
            trimmedValue;
    }

    return payload;
}


// ---------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------

function HomeProfile({
    profile,
    isLoading,
    loadError,
    onSave,
}) {
    const [
        isEditing,
        setIsEditing,
    ] = useState(false);

    const [
        form,
        setForm,
    ] = useState(
        EMPTY_PROFILE_FORM
    );

    const [
        isSaving,
        setIsSaving,
    ] = useState(false);

    const [
        saveError,
        setSaveError,
    ] = useState("");

    const [
        saveMessage,
        setSaveMessage,
    ] = useState("");


    // Count how complete the structured profile is.
    const profileProgress =
        useMemo(() => {
            const fieldNames =
                Object.keys(
                    EMPTY_PROFILE_FORM
                );

            const completed =
                fieldNames.filter(
                    (fieldName) => {
                        const value =
                            profile?.[
                            fieldName
                            ];

                        return (
                            value !== null &&
                            value !== undefined &&
                            value !== ""
                        );
                    }
                ).length;

            const total =
                fieldNames.length;

            const percent =
                total === 0
                    ? 0
                    : Math.round(
                        (completed / total) *
                        100
                    );

            return {
                completed,
                total,
                percent,
            };
        }, [profile]);


    function updateFormField(
        fieldName,
        value
    ) {
        setForm(
            (currentForm) => ({
                ...currentForm,
                [fieldName]:
                    value,
            })
        );
    }


    function cancelEditing() {
        setForm(
            createFormFromProfile(
                profile
            )
        );

        setIsEditing(false);
        setSaveError("");
        setSaveMessage("");
    }


    async function handleSubmit(
        event
    ) {
        event.preventDefault();

        try {
            setIsSaving(true);
            setSaveError("");
            setSaveMessage("");

            const payload =
                createPatchPayload(
                    form
                );

            await onSave(payload);

            setSaveMessage(
                "Home profile saved."
            );

            setIsEditing(false);
        } catch (error) {
            console.error(
                "Could not save home profile:",
                error
            );

            const backendFields =
                error.response?.data?.fields;

            if (
                backendFields &&
                typeof backendFields ===
                "object"
            ) {
                setSaveError(
                    Object.values(
                        backendFields
                    ).join(" ")
                );

                return;
            }

            setSaveError(
                error.response?.data?.error ||
                "HouseIQ could not save the home profile."
            );
        } finally {
            setIsSaving(false);
        }
    }


    if (isLoading) {
        return (
            <section className="home-profile-state">
                <h3>
                    Loading home profile
                </h3>

                <p>
                    HouseIQ is retrieving the
                    structured details for this
                    home.
                </p>
            </section>
        );
    }


    if (loadError) {
        return (
            <section className="home-profile-state home-profile-error">
                <h3>
                    Profile could not be loaded
                </h3>

                <p>{loadError}</p>
            </section>
        );
    }


    if (!profile) {
        return (
            <section className="home-profile-state">
                <h3>
                    No profile available
                </h3>

                <p>
                    Select a home to view its
                    profile.
                </p>
            </section>
        );
    }


    return (
        <section className="home-profile">
            <header className="home-profile-header">

                <div>
                    <p className="eyebrow">
                        Structured home record
                    </p>

                    <h3>
                        {profile.homeName}
                    </h3>

                    <p className="home-profile-introduction">
                        Keep the important physical
                        facts about this home in one
                        dependable place.
                    </p>
                </div>

                {!isEditing && (
                    <button
                        type="button"
                        onClick={() => {
                            // Populate the draft from the latest
                            // server profile when entering edit
                            // mode (avoids syncing via useEffect).
                            setForm(
                                createFormFromProfile(
                                    profile
                                )
                            );
                            setIsEditing(true);
                            setSaveError("");
                            setSaveMessage("");
                        }}
                    >
                        Edit profile
                    </button>
                )}
            </header>
            <HomeOnboarding
                profile={
                    profile
                }
                onSave={
                    onSave
                }
            />


            <div className="profile-progress-card">
                <div className="profile-progress-copy">
                    <strong>
                        Profile completeness
                    </strong>

                    <span>
                        {
                            profileProgress.completed
                        }{" "}
                        of{" "}
                        {profileProgress.total}{" "}
                        details saved
                    </span>
                </div>

                <div
                    className="profile-progress-track"
                    aria-label={`Profile ${profileProgress.percent}% complete`}
                >
                    <div
                        className="profile-progress-fill"
                        style={{
                            width:
                                `${profileProgress.percent}%`,
                        }}
                    />
                </div>

                <strong className="profile-progress-percent">
                    {
                        profileProgress.percent
                    }
                    %
                </strong>
            </div>


            <div className="profile-summary-strip">
                <div>
                    <span>Year built</span>

                    <strong>
                        {profile.yearBuilt ||
                            "Unknown"}
                    </strong>
                </div>

                <div>
                    <span>Property type</span>

                    <strong>
                        {formatLabel(
                            profile.propertyType
                        )}
                    </strong>
                </div>

                <div>
                    <span>Size</span>

                    <strong>
                        {profile.squareFeet
                            ? `${formatNumber(
                                profile.squareFeet
                            )} sq ft`
                            : "Unknown"}
                    </strong>
                </div>

                <div>
                    <span>Onboarding</span>

                    <strong>
                        {formatLabel(
                            profile.onboardingStatus
                        )}
                    </strong>
                </div>
            </div>


            {saveError && (
                <div className="profile-save-message profile-save-error">
                    {saveError}
                </div>
            )}

            {saveMessage && (
                <div className="profile-save-message profile-save-success">
                    {saveMessage}
                </div>
            )}


            {isEditing ? (
                <form
                    className="profile-form"
                    onSubmit={handleSubmit}
                >
                    {PROFILE_SECTIONS.map(
                        (section) => (
                            <section
                                key={section.id}
                                className="profile-section-card"
                            >
                                <header>
                                    <h4>
                                        {section.title}
                                    </h4>

                                    <p>
                                        {
                                            section.description
                                        }
                                    </p>
                                </header>

                                <div className="profile-field-grid">
                                    {section.fields.map(
                                        (field) => (
                                            <label
                                                key={
                                                    field.name
                                                }
                                                className="profile-form-field"
                                            >
                                                <span>
                                                    {field.label}
                                                </span>

                                                {field.type ===
                                                    "select" ? (
                                                    <select
                                                        value={
                                                            form[
                                                            field
                                                                .name
                                                            ]
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            updateFormField(
                                                                field.name,
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                        disabled={
                                                            isSaving
                                                        }
                                                    >
                                                        {field.options.map(
                                                            (
                                                                option
                                                            ) => (
                                                                <option
                                                                    key={
                                                                        option.value
                                                                    }
                                                                    value={
                                                                        option.value
                                                                    }
                                                                >
                                                                    {
                                                                        option.label
                                                                    }
                                                                </option>
                                                            )
                                                        )}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        min={
                                                            field.minimum
                                                        }
                                                        step={
                                                            field.step
                                                        }
                                                        value={
                                                            form[
                                                            field
                                                                .name
                                                            ]
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            updateFormField(
                                                                field.name,
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                        disabled={
                                                            isSaving
                                                        }
                                                        placeholder="Unknown"
                                                    />
                                                )}
                                            </label>
                                        )
                                    )}
                                </div>
                            </section>
                        )
                    )}


                    <div className="profile-form-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={
                                cancelEditing
                            }
                            disabled={isSaving}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={isSaving}
                        >
                            {isSaving
                                ? "Saving profile..."
                                : "Save profile"}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="profile-sections">
                    {PROFILE_SECTIONS.map(
                        (section) => (
                            <section
                                key={section.id}
                                className="profile-section-card"
                            >
                                <header>
                                    <h4>
                                        {section.title}
                                    </h4>

                                    <p>
                                        {
                                            section.description
                                        }
                                    </p>
                                </header>

                                <dl className="profile-detail-grid">
                                    {section.fields.map(
                                        (field) => {
                                            const value =
                                                profile[
                                                field.name
                                                ];

                                            const isNumber =
                                                field.type ===
                                                "number";

                                            return (
                                                <div
                                                    key={
                                                        field.name
                                                    }
                                                    className={
                                                        value ===
                                                            null ||
                                                            value ===
                                                            undefined ||
                                                            value ===
                                                            ""
                                                            ? "profile-detail profile-detail-unknown"
                                                            : "profile-detail"
                                                    }
                                                >
                                                    <dt>
                                                        {
                                                            field.label
                                                        }
                                                    </dt>

                                                    <dd>
                                                        {(() => {
                                                            if (!isNumber) {
                                                                return formatLabel(
                                                                    value
                                                                );
                                                            }

                                                            const formatted =
                                                                formatNumber(
                                                                    value
                                                                );

                                                            if (
                                                                !field.unit ||
                                                                formatted ===
                                                                "Unknown"
                                                            ) {
                                                                return formatted;
                                                            }

                                                            return `${formatted} ${field.unit}`;
                                                        })()}
                                                    </dd>
                                                </div>
                                            );
                                        }
                                    )}
                                </dl>
                            </section>
                        )
                    )}
                </div>
            )}
        </section>
    );
}


export default HomeProfile;