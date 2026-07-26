// frontend/src/components/home-profile/profileSections.js

// ---------------------------------------------------------
// EMPTY FORM STATE
// ---------------------------------------------------------
//
// React inputs should use empty strings instead of undefined
// or null. That keeps every field controlled from the first
// render.
//
export const EMPTY_PROFILE_FORM = {
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
export const PROFILE_SECTIONS = [
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
