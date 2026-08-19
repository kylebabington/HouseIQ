// backend/tests/entity_resolution.test.js

import {
    describe,
    expect,
    test,
} from "vitest";

import {
    extractEventId,
    extractSystemKey,
    extractWorkFamily,
    assetIdentityKey,
} from "../lib/entityKeys.js";

import {
    resolveCandidate,
    scoreProjectMatch,
} from "../services/entityResolution.js";

describe("entity keys", () => {
    test("reads demo event IDs from filenames", () => {
        expect(
            extractEventId(
                "35__2021-06-18_E2021-04_invoice_full_roof_replacement.pdf"
            )
        ).toBe("E2021-04");
    });

    test("keeps garage leaks, chimney leaks, and roof replacements apart", () => {
        expect(
            extractSystemKey(
                "Garage roof leak investigation"
            )
        ).toBe("garage_roof");
        expect(
            extractSystemKey(
                "Chimney-side roof leak investigation"
            )
        ).toBe("chimney");
        expect(
            extractSystemKey("Full roof replacement")
        ).toBe("roof");
    });

    test("groups quotes and invoices as replacement work", () => {
        expect(
            extractWorkFamily(
                "Roof replacement quote - Cedar Ridge"
            )
        ).toBe("replacement");
        expect(
            extractWorkFamily(
                "invoice full roof replacement"
            )
        ).toBe("replacement");
        expect(
            extractWorkFamily(
                "Garage roof leak investigation"
            )
        ).toBe("repair");
    });
});

describe("entity resolution", () => {
    test("same event documents link to one project", () => {
        const decision = resolveCandidate(
            "project",
            {
                title: "Gas water heater replacement invoice",
            },
            [
                {
                    id: "p1",
                    title: "Gas water heater replacement estimate",
                    file_name:
                        "03__2014-04-22_E2014-01_estimate_gas_water_heater_replacement.pdf",
                },
            ],
            {
                fileName:
                    "04__2014-04-22_E2014-01_invoice_gas_water_heater_replacement.pdf",
            }
        );

        expect(decision.action).toBe("link");
        expect(decision.match.id).toBe("p1");
    });

    test("Cedar Ridge quote and the 2021 replacement are one project", () => {
        const scored = scoreProjectMatch(
            {
                title: "Full roof replacement",
            },
            {
                id: "p-roof",
                title: "Roof replacement quote - Cedar Ridge",
            },
            "35__2021-06-18_E2021-04_invoice_full_roof_replacement.pdf"
        );

        expect(["exact", "likely"]).toContain(
            scored.confidence
        );

        const decision = resolveCandidate(
            "project",
            { title: "Full roof replacement" },
            [
                {
                    id: "p-roof",
                    title: "Roof replacement quote - Cedar Ridge",
                },
            ],
            {
                fileName:
                    "35__2021-06-18_E2021-04_invoice_full_roof_replacement.pdf",
            }
        );

        expect(decision.action).toBe("link");
    });

    test("Skyline's competing quote still attaches to the roof replacement", () => {
        const decision = resolveCandidate(
            "project",
            {
                title: "Roof replacement quote - Skyline",
            },
            [
                {
                    id: "p-roof",
                    title: "Full roof replacement",
                    description:
                        "Tear-off and install architectural shingles",
                },
            ],
            {
                fileName:
                    "33__2021-04-18_E2021-03_estimate_roof_replacement_quote_skyline.pdf",
            }
        );

        expect(decision.action).toBe("link");
    });

    test("does not merge a garage leak into the later roof replacement", () => {
        const decision = resolveCandidate(
            "issue",
            {
                title: "Full roof replacement needed",
                description:
                    "Replace the main house roof in 2021",
            },
            [
                {
                    id: "i-garage",
                    title: "Garage roof leak investigation",
                    description:
                        "Leak at the garage roof in 2017",
                    category: "roofing",
                },
            ],
            {
                fileName:
                    "35__2021-06-18_E2021-04_invoice_full_roof_replacement.pdf",
            }
        );

        expect(decision.action).not.toBe("link");
    });

    test("case-insensitive titles merge", () => {
        const decision = resolveCandidate(
            "issue",
            { title: "Aged roof shingles" },
            [{ id: "i1", title: "Aged Roof Shingles" }]
        );
        expect(decision.action).toBe("link");
    });

    test("identical garage leak titles merge", () => {
        const decision = resolveCandidate(
            "issue",
            { title: "Garage Roof Leak" },
            [{ id: "i1", title: "Garage Roof Leak" }]
        );
        expect(decision.action).toBe("link");
    });

    test("does not merge chimney and garage leak issues", () => {
        const decision = resolveCandidate(
            "issue",
            {
                title: "Chimney-side roof leak investigation",
            },
            [
                {
                    id: "i-garage",
                    title: "Garage roof leak investigation",
                },
            ]
        );

        expect(decision.action).not.toBe("link");
    });

    test("matches a roof asset by identity even when names differ slightly", () => {
        expect(
            assetIdentityKey({
                asset_type: "roof",
                name: "Asphalt shingle roof",
            })
        ).toBe("name::roof::asphalt shingle roof");

        const decision = resolveCandidate(
            "asset",
            {
                assetType: "roof",
                name: "Asphalt shingle roof",
            },
            [
                {
                    id: "a-roof",
                    asset_type: "roof",
                    name: "Asphalt shingle roof",
                },
            ]
        );

        expect(decision.action).toBe("link");
        expect(decision.confidence).toBe("exact");
    });

    test("later furnace service attaches to the original furnace", () => {
        const decision = resolveCandidate(
            "asset",
            {
                assetType: "hvac",
                name: "Furnace blower motor replacement",
            },
            [
                {
                    id: "a-furnace",
                    asset_type: "furnace",
                    name: "High-efficiency furnace",
                    notes: "Carrier 96% installed 2014",
                },
            ],
            {
                fileName:
                    "37__2023-02-14_E2023-01_invoice_furnace_blower_motor_replacement.txt",
            }
        );

        expect(decision.action).toBe("link");
        expect(decision.match.id).toBe("a-furnace");
    });

    test("2018 capacitor and 2020 refrigerant work stay on one AC", () => {
        const decision = resolveCandidate(
            "asset",
            {
                assetType: "air_conditioner",
                name: "Air conditioner refrigerant leak service",
            },
            [
                {
                    id: "a-ac",
                    asset_type: "hvac",
                    name: "Outdoor condenser",
                    notes: "Capacitor replaced 2018",
                },
            ],
            {
                fileName:
                    "29__2020-07-22_E2020-04_invoice_air_conditioner_refrigerant_leak_service.pdf",
            }
        );

        expect(decision.action).toBe("link");
        expect(decision.match.id).toBe("a-ac");
    });

    test("generic HVAC filenames do not classify as AC", () => {
        expect(
            extractSystemKey(
                "2025-10-08_E2025-01_inspection_hvac_annual_inspection.txt"
            )
        ).toBeNull();
    });

    test("HVAC annual inspection of the furnace attaches to the furnace", () => {
        const decision = resolveCandidate(
            "asset",
            {
                assetType: "hvac",
                name: "Annual HVAC inspection",
                notes: "Furnace operating normally",
            },
            [
                {
                    id: "a-furnace",
                    asset_type: "furnace",
                    name: "High-efficiency furnace",
                    notes: "Carrier 96% installed 2014",
                },
            ],
            {
                fileName:
                    "38__2025-10-08_E2025-01_inspection_hvac_annual_inspection.txt",
            }
        );

        expect(decision.action).toBe("link");
        expect(decision.match.id).toBe("a-furnace");
    });

    test("outdoor condenser and later refrigerant AC stay one asset", () => {
        const decision = resolveCandidate(
            "asset",
            {
                assetType: "HVAC System",
                name: "Air Conditioner",
                notes: "18-year-old system with refrigerant leak issues.",
            },
            [
                {
                    id: "a-ac",
                    asset_type: "Air Conditioner",
                    name: "Outdoor Unit",
                    brand: "Northstar Parts",
                    model: "NS45-5",
                    notes: "Approximately 16 years old, capacitor replaced on 2018-07-18.",
                },
            ],
            {
                fileName:
                    "29__2020-07-22_E2020-04_invoice_air_conditioner_refrigerant_leak_service.pdf",
            }
        );

        expect(decision.action).toBe("link");
        expect(decision.match.id).toBe("a-ac");
    });
});
