// backend/routes/demo.js
//
// Public read-only demo home + authenticated seed for the
// "1978 Indianapolis Ranch" signature demo.

import { Router } from "express";
import { createHash, randomBytes } from "crypto";

import { requireAuth, getAuthenticatedUserId } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const DEMO_HOME = {
    id: "demo-indianapolis-ranch",
    name: "1978 Indianapolis Ranch",
    yearBuilt: 1978,
    profile: {
        propertyType: "single_family",
        postalCode: "46220",
        city: "Indianapolis",
        state: "IN",
        stories: 1,
        bedrooms: 3,
        fullBathrooms: 2,
        heatingType: "forced_air_gas",
        coolingType: "central_ac",
        roofMaterial: "asphalt_shingle",
        foundationType: "crawlspace",
    },
    story: [
        {
            step: 1,
            title: "Empty home memory",
            detail: "A new HouseIQ home starts with almost nothing known.",
        },
        {
            step: 2,
            title: "Inspection uploaded",
            detail:
                "HouseIQ proposes a roof asset, HVAC asset, and several issues with source quotes.",
        },
        {
            step: 3,
            title: "Homeowner approves",
            detail: "Proposed records become verified facts only after review.",
        },
        {
            step: 4,
            title: "HVAC invoice linked",
            detail:
                "A repair invoice ties to the existing system and updates maintenance history.",
        },
        {
            step: 5,
            title: "Winter plan with evidence",
            detail:
                "Ask what to handle before winter—ranked priorities cite inspection pages.",
        },
    ],
    sampleNeeds: [
        {
            kind: "issue",
            title: "Service mast attachment deteriorated",
            score: 92,
            timingBucket: "30_days",
            explanation:
                "Safety-sensitive electrical exposure with inspection evidence on page 18.",
            evidencePassage:
                "Service mast attachment at north eaves shows advanced corrosion.",
        },
        {
            kind: "issue",
            title: "Crawlspace moisture staining",
            score: 74,
            timingBucket: "90_days",
            explanation:
                "Moisture risk rises before freeze/thaw; schedule before winter.",
        },
        {
            kind: "asset",
            title: "Forced-air furnace approaching service interval",
            score: 61,
            timingBucket: "90_days",
            explanation:
                "Last documented service is overdue relative to manufacturer guidance.",
        },
    ],
    sampleAnswer: {
        question: "What should I handle before winter?",
        answer:
            "Prioritize the deteriorated service mast attachment (inspection evidence), then address crawlspace moisture before freeze season, and schedule furnace service. Your roof appears roughly mid-life based on the asphalt-shingle notes in the inspection—monitor, do not replace yet.",
        citations: [
            {
                label: "Inspection — service mast",
                passage:
                    "Service mast attachment at north eaves shows advanced corrosion.",
                page: 18,
            },
        ],
    },
};

export function createDemoRouter() {
    const router = Router();

    // Public, no auth — judges can explore without signing up.
    router.get("/demo/home", (_req, res) => {
        return res.json(DEMO_HOME);
    });

    // Authenticated seed: creates a real home named for the demo.
    router.post(
        "/demo/seed-indianapolis-ranch",
        requireAuth,
        async (req, res) => {
            const auth0Id = getAuthenticatedUserId(req);
            let client;

            try {
                client = await pool.connect();
                await client.query("BEGIN");

                const homeResult = await client.query(
                    `
                    INSERT INTO homes (name, year_built, owner_auth0_id)
                    VALUES ($1, $2, $3)
                    RETURNING *
                    `,
                    [
                        "1978 Indianapolis Ranch",
                        1978,
                        auth0Id,
                    ]
                );

                const home = homeResult.rows[0];

                await client.query(
                    `
                    INSERT INTO home_members (home_id, member_auth0_id, role)
                    VALUES ($1, $2, 'owner')
                    ON CONFLICT DO NOTHING
                    `,
                    [home.id, auth0Id]
                );

                await client.query(
                    `
                    INSERT INTO home_profiles (
                        home_id,
                        property_type,
                        postal_code,
                        city,
                        state,
                        stories,
                        bedrooms,
                        full_bathrooms,
                        heating_type,
                        cooling_type,
                        roof_material,
                        foundation_type,
                        onboarding_status,
                        onboarding_step
                    )
                    VALUES (
                        $1, 'single_family', '46220', 'Indianapolis', 'IN',
                        1, 3, 2, 'forced_air_gas', 'central_ac',
                        'asphalt_shingle', 'crawlspace',
                        'completed', 0
                    )
                    ON CONFLICT (home_id) DO UPDATE SET
                        postal_code = EXCLUDED.postal_code,
                        city = EXCLUDED.city,
                        state = EXCLUDED.state,
                        onboarding_status = 'completed'
                    `,
                    [home.id]
                );

                // Seed accepted starter records so Needs has content
                // before document upload in a live demo.
                await client.query(
                    `
                    INSERT INTO home_assets (
                        home_id, asset_type, name, brand, location,
                        install_date, verification_status, notes
                    )
                    VALUES
                    ($1, 'hvac', 'Forced-air furnace', 'Carrier', 'Basement utility',
                     '2012-06-01', 'accepted', 'Seeded for demo; replace with invoice facts after upload.'),
                    ($1, 'roof', 'Asphalt shingle roof', '', 'Whole house',
                     '2014-01-01', 'accepted', 'Approximate age from inspection narrative.')
                    `,
                    [home.id]
                );

                await client.query(
                    `
                    INSERT INTO home_issues (
                        home_id, title, description, status, priority,
                        category, verification_status, evidence_passage, evidence_page
                    )
                    VALUES
                    ($1, 'Service mast attachment deteriorated',
                     'North eaves service mast shows advanced corrosion.',
                     'open', 'urgent', 'electrical', 'accepted',
                     'Service mast attachment at north eaves shows advanced corrosion.', 18),
                    ($1, 'Crawlspace moisture staining',
                     'Moisture staining noted; monitor and mitigate before freeze.',
                     'open', 'high', 'foundation', 'accepted',
                     'Moisture staining observed at northeast crawlspace sill.', 12)
                    `,
                    [home.id]
                );

                await client.query("COMMIT");

                return res.status(201).json({
                    message:
                        "Demo home seeded. Upload DOCS fixtures next, then ask about winter.",
                    home,
                    nextSteps: [
                        "Upload sample inspection from DOCS/",
                        "Review proposed changes",
                        "Upload HVAC invoice",
                        "Ask: What should I handle before winter?",
                    ],
                });
            } catch (error) {
                if (client) {
                    try {
                        await client.query("ROLLBACK");
                    } catch {
                        /* ignore */
                    }
                }
                console.error("Demo seed failed:", error);
                return res.status(500).json({
                    error: "Failed to seed demo home",
                });
            } finally {
                if (client) {
                    client.release();
                }
            }
        }
    );

    return router;
}

/**
 * Creates a hashed invite token for home_invites.
 */
export function createInviteToken() {
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");
    return { token, tokenHash };
}
