// frontend/src/components/home-profile/onboardingQuestions.js

// ---------------------------------------------------------
// ONBOARDING QUESTION CATALOG
// ---------------------------------------------------------
//
// This is the controlled sequence for the first onboarding
// experience.
//
// Each question identifies:
//
// - the home-profile field it updates
// - the wording shown to the user
// - the expected input type
// - optional choices
// - a function that converts browser input into API data
//
// The LLM does not choose database fields or construct SQL.
// The application owns that logic.
//
export const ONBOARDING_QUESTIONS = [
    {
        field:
            "propertyType",

        title:
            "What kind of home is this?",

        helpText:
            "Choose the option that best describes the property.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "single_family",

                label:
                    "Single-family home",
            },
            {
                value:
                    "townhouse",

                label:
                    "Townhouse",
            },
            {
                value:
                    "condo",

                label:
                    "Condominium",
            },
            {
                value:
                    "duplex",

                label:
                    "Duplex",
            },
            {
                value:
                    "manufactured_home",

                label:
                    "Manufactured home",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "postalCode",

        title:
            "What is the home's ZIP / postal code?",

        helpText:
            "Used for seasonal priorities that fit this climate — not shared publicly.",

        inputType:
            "text",

        placeholder:
            "Example: 44101",

        parseValue:
            (value) => {
                const trimmed =
                    typeof value === "string"
                        ? value.trim()
                        : "";
                return trimmed || null;
            },
    },

    {
        field:
            "city",

        title:
            "What city is the home in?",

        helpText:
            "Optional but helps HouseIQ localize advice.",

        inputType:
            "text",

        placeholder:
            "Example: Cleveland",

        parseValue:
            (value) => {
                const trimmed =
                    typeof value === "string"
                        ? value.trim()
                        : "";
                return trimmed || null;
            },
    },

    {
        field:
            "state",

        title:
            "What state is the home in?",

        helpText:
            "Two-letter code is fine (e.g. OH).",

        inputType:
            "text",

        placeholder:
            "Example: OH",

        parseValue:
            (value) => {
                const trimmed =
                    typeof value === "string"
                        ? value.trim()
                        : "";
                return trimmed || null;
            },
    },

    {
        field:
            "squareFeet",

        title:
            "About how large is the home?",

        helpText:
            "An estimate is completely fine. Enter the finished living area in square feet.",

        inputType:
            "number",

        placeholder:
            "Example: 1850",

        minimum:
            1,

        step:
            1,

        suffix:
            "square feet",

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "bedrooms",

        title:
            "How many bedrooms does it have?",

        helpText:
            "Count rooms that are normally considered bedrooms.",

        inputType:
            "number",

        placeholder:
            "Example: 3",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "fullBathrooms",

        title:
            "How many full bathrooms are there?",

        helpText:
            "A full bathroom normally includes a toilet, sink, and bathtub or shower.",

        inputType:
            "number",

        placeholder:
            "Example: 2",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "halfBathrooms",

        title:
            "How many half bathrooms are there?",

        helpText:
            "A half bathroom usually has a toilet and sink but no bathtub or shower.",

        inputType:
            "number",

        placeholder:
            "Example: 1",

        minimum:
            0,

        step:
            1,

        parseValue:
            (value) =>
                Number.parseInt(
                    value,
                    10
                ),
    },

    {
        field:
            "stories",

        title:
            "How many stories does the home have?",

        helpText:
            "Values such as 1, 1.5, and 2 are accepted.",

        inputType:
            "number",

        placeholder:
            "Example: 2",

        minimum:
            0.5,

        step:
            0.5,

        parseValue:
            (value) =>
                Number.parseFloat(
                    value
                ),
    },

    {
        field:
            "foundationType",

        title:
            "What is underneath the home?",

        helpText:
            "Choose the primary foundation type.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "basement",

                label:
                    "Basement",
            },
            {
                value:
                    "crawl_space",

                label:
                    "Crawl space",
            },
            {
                value:
                    "slab",

                label:
                    "Concrete slab",
            },
            {
                value:
                    "pier_and_beam",

                label:
                    "Pier and beam",
            },
            {
                value:
                    "mixed",

                label:
                    "More than one type",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "exteriorMaterial",

        title:
            "What is the primary exterior material?",

        helpText:
            "Choose the material covering most of the outside walls.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "vinyl",

                label:
                    "Vinyl siding",
            },
            {
                value:
                    "wood",

                label:
                    "Wood siding",
            },
            {
                value:
                    "fiber_cement",

                label:
                    "Fiber cement",
            },
            {
                value:
                    "brick",

                label:
                    "Brick",
            },
            {
                value:
                    "stone",

                label:
                    "Stone",
            },
            {
                value:
                    "stucco",

                label:
                    "Stucco",
            },
            {
                value:
                    "metal",

                label:
                    "Metal",
            },
            {
                value:
                    "mixed",

                label:
                    "Mixed materials",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "roofMaterial",

        title:
            "What is the roof made from?",

        helpText:
            "Choose the primary roof covering.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "asphalt_shingle",

                label:
                    "Asphalt shingles",
            },
            {
                value:
                    "metal",

                label:
                    "Metal",
            },
            {
                value:
                    "tile",

                label:
                    "Tile",
            },
            {
                value:
                    "slate",

                label:
                    "Slate",
            },
            {
                value:
                    "wood_shake",

                label:
                    "Wood shake",
            },
            {
                value:
                    "rubber_membrane",

                label:
                    "Rubber membrane",
            },
            {
                value:
                    "built_up",

                label:
                    "Built-up roof",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "heatingType",

        title:
            "How is the home primarily heated?",

        helpText:
            "Choose the system responsible for most of the heating.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "gas_furnace",

                label:
                    "Gas furnace",
            },
            {
                value:
                    "electric_furnace",

                label:
                    "Electric furnace",
            },
            {
                value:
                    "heat_pump",

                label:
                    "Heat pump",
            },
            {
                value:
                    "boiler",

                label:
                    "Boiler",
            },
            {
                value:
                    "radiant",

                label:
                    "Radiant heat",
            },
            {
                value:
                    "baseboard",

                label:
                    "Baseboard heat",
            },
            {
                value:
                    "wood_stove",

                label:
                    "Wood stove",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "coolingType",

        title:
            "How is the home cooled?",

        helpText:
            "Choose the primary cooling system.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "central_air",

                label:
                    "Central air",
            },
            {
                value:
                    "heat_pump",

                label:
                    "Heat pump",
            },
            {
                value:
                    "mini_split",

                label:
                    "Mini-split",
            },
            {
                value:
                    "window_units",

                label:
                    "Window units",
            },
            {
                value:
                    "evaporative_cooler",

                label:
                    "Evaporative cooler",
            },
            {
                value:
                    "none",

                label:
                    "No cooling system",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "waterSource",

        title:
            "Where does the home's water come from?",

        helpText:
            "Most homes use municipal water or a private well.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "municipal",

                label:
                    "Municipal water",
            },
            {
                value:
                    "private_well",

                label:
                    "Private well",
            },
            {
                value:
                    "shared_well",

                label:
                    "Shared well",
            },
            {
                value:
                    "cistern",

                label:
                    "Cistern",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "sewerType",

        title:
            "Where does the wastewater go?",

        helpText:
            "Choose municipal sewer, septic, or the closest match.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "municipal",

                label:
                    "Municipal sewer",
            },
            {
                value:
                    "septic",

                label:
                    "Private septic system",
            },
            {
                value:
                    "shared_septic",

                label:
                    "Shared septic system",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },

    {
        field:
            "garageType",

        title:
            "What kind of garage or covered parking does it have?",

        helpText:
            "Choose the closest match.",

        inputType:
            "choice",

        options: [
            {
                value:
                    "none",

                label:
                    "No garage",
            },
            {
                value:
                    "attached",

                label:
                    "Attached garage",
            },
            {
                value:
                    "detached",

                label:
                    "Detached garage",
            },
            {
                value:
                    "carport",

                label:
                    "Carport",
            },
            {
                value:
                    "integral",

                label:
                    "Integral or basement garage",
            },
            {
                value:
                    "other",

                label:
                    "Something else",
            },
        ],

        parseValue:
            (value) =>
                value,
    },
];
