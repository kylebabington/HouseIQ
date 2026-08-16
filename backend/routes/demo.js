// backend/routes/demo.js
//
// Public read-only demo backed by a real HouseIQ home.
//
// PUBLIC_DEMO_HOME_ID selects which real home is exposed. The home still
// belongs to its normal Auth0 owner, so uploads and edits continue through the
// regular authenticated HouseIQ routes. This route only returns a deliberately
// limited, read-only projection and never exposes S3 keys, source URLs, owner
// identifiers, embeddings, invite data, or extracted document text.

import { Router } from "express";
import { createHash, randomBytes } from "crypto";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const FALLBACK_DEMO = {
    source: "fallback",
    home: {
        id: "demo-indianapolis-ranch",
        name: "1978 Indianapolis Ranch",
        yearBuilt: 1978,
        notes:
            "Fallback preview shown until PUBLIC_DEMO_HOME_ID points to a real HouseIQ home.",
    },
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
    stats: {
        documents: 0,
        assets: 2,
        issues: 2,
        projects: 0,
        memories: 0,
    },
    assets: [
        {
            id: "fallback-furnace",
            assetType: "hvac",
            name: "Forced-air furnace",
            brand: "Carrier",
            location: "Basement utility",
        },
        {
            id: "fallback-roof",
            assetType: "roof",
            name: "Asphalt shingle roof",
            location: "Whole house",
        },
    ],
    issues: [
        {
            id: "fallback-electrical",
            title: "Service mast attachment deteriorated",
            status: "open",
            priority: "urgent",
            category: "electrical",
        },
        {
            id: "fallback-moisture",
            title: "Crawlspace moisture staining",
            status: "open",
            priority: "high",
            category: "foundation",
        },
    ],
    projects: [],
    memories: [],
    documents: [],
};

function profileFromRow(row) {
    if (!row.profile_id) {
        return null;
    }

    return {
        propertyType: row.property_type,
        squareFeet: row.square_feet,
        bedrooms: row.bedrooms,
        fullBathrooms: row.full_bathrooms,
        halfBathrooms: row.half_bathrooms,
        stories: row.stories,
        foundationType: row.foundation_type,
        basementType: row.basement_type,
        exteriorMaterial: row.exterior_material,
        roofMaterial: row.roof_material,
        heatingType: row.heating_type,
        coolingType: row.cooling_type,
        waterHeaterType: row.water_heater_type,
        waterSource: row.water_source,
        sewerType: row.sewer_type,
        electricalServiceAmps: row.electrical_service_amps,
        garageType: row.garage_type,
        garageSpaces: row.garage_spaces,
        lotSizeAcres: row.lot_size_acres,
        postalCode: row.postal_code,
        city: row.city,
        state: row.state,
    };
}

async function loadPublicDemoHome(homeId) {
    const homeResult = await pool.query(
        `
        SELECT
            h.id,
            h.name,
            h.year_built,
            h.notes,
            h.created_at,
            h.updated_at,
            hp.id AS profile_id,
            hp.property_type,
            hp.square_feet,
            hp.bedrooms,
            hp.full_bathrooms,
            hp.half_bathrooms,
            hp.stories,
            hp.foundation_type,
            hp.basement_type,
            hp.exterior_material,
            hp.roof_material,
            hp.heating_type,
            hp.cooling_type,
            hp.water_heater_type,
            hp.water_source,
            hp.sewer_type,
            hp.electrical_service_amps,
            hp.garage_type,
            hp.garage_spaces,
            hp.lot_size_acres,
            hp.postal_code,
            hp.city,
            hp.state
        FROM homes h
        LEFT JOIN home_profiles hp
            ON hp.home_id = h.id
        WHERE h.id = $1
        LIMIT 1
        `,
        [homeId]
    );

    if (homeResult.rows.length === 0) {
        return null;
    }

    const homeRow = homeResult.rows[0];

    const [
        assetsResult,
        issuesResult,
        projectsResult,
        memoriesResult,
        documentsResult,
    ] = await Promise.all([
        pool.query(
            `
            SELECT
                id,
                asset_type,
                name,
                brand,
                model,
                install_date,
                purchase_date,
                warranty_expiration,
                last_service_date,
                location,
                verification_status,
                notes
            FROM home_assets
            WHERE home_id = $1
            ORDER BY COALESCE(install_date, purchase_date) DESC NULLS LAST,
                     created_at DESC
            LIMIT 100
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                id,
                title,
                description,
                status,
                priority,
                category,
                suspected_cause,
                recommended_next_step,
                verification_status,
                evidence_passage,
                evidence_page,
                created_at,
                updated_at
            FROM home_issues
            WHERE home_id = $1
            ORDER BY created_at DESC
            LIMIT 100
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                id,
                title,
                description,
                status,
                priority,
                estimated_cost_low,
                estimated_cost_high,
                diy_difficulty,
                verification_status,
                created_at,
                updated_at
            FROM home_projects
            WHERE home_id = $1
            ORDER BY created_at DESC
            LIMIT 100
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                id,
                title,
                category,
                content,
                importance,
                verification_status,
                evidence_passage,
                evidence_page,
                created_at,
                updated_at
            FROM memories
            WHERE home_id = $1
            ORDER BY created_at DESC
            LIMIT 100
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                id,
                document_type,
                file_name,
                summary,
                metadata->>'documentDate' AS document_date,
                metadata->>'contractorOrCompany' AS contractor_or_company,
                metadata->>'totalAmount' AS total_amount,
                created_at,
                updated_at
            FROM documents
            WHERE home_id = $1
            ORDER BY created_at DESC
            LIMIT 200
            `,
            [homeId]
        ),
    ]);

    const assets = assetsResult.rows.map((row) => ({
        id: row.id,
        assetType: row.asset_type,
        name: row.name,
        brand: row.brand,
        model: row.model,
        installDate: row.install_date,
        purchaseDate: row.purchase_date,
        warrantyExpiration: row.warranty_expiration,
        lastServiceDate: row.last_service_date,
        location: row.location,
        verificationStatus: row.verification_status,
        notes: row.notes,
    }));

    const issues = issuesResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        category: row.category,
        suspectedCause: row.suspected_cause,
        recommendedNextStep: row.recommended_next_step,
        verificationStatus: row.verification_status,
        evidencePassage: row.evidence_passage,
        evidencePage: row.evidence_page,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));

    const projects = projectsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        estimatedCostLow: row.estimated_cost_low,
        estimatedCostHigh: row.estimated_cost_high,
        diyDifficulty: row.diy_difficulty,
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));

    const memories = memoriesResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        content: row.content,
        importance: row.importance,
        verificationStatus: row.verification_status,
        evidencePassage: row.evidence_passage,
        evidencePage: row.evidence_page,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));

    const documents = documentsResult.rows.map((row) => ({
        id: row.id,
        documentType: row.document_type,
        fileName: row.file_name,
        summary: row.summary,
        documentDate: row.document_date,
        contractorOrCompany: row.contractor_or_company,
        totalAmount: row.total_amount,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));

    return {
        source: "database",
        home: {
            id: homeRow.id,
            name: homeRow.name,
            yearBuilt: homeRow.year_built,
            notes: homeRow.notes,
            createdAt: homeRow.created_at,
            updatedAt: homeRow.updated_at,
        },
        profile: profileFromRow(homeRow),
        stats: {
            documents: documents.length,
            assets: assets.length,
            issues: issues.length,
            projects: projects.length,
            memories: memories.length,
        },
        assets,
        issues,
        projects,
        memories,
        documents,
    };
}

export function createDemoRouter() {
    const router = Router();

    // Public, read-only view of the real home configured for the demo.
    router.get("/demo/home", async (_req, res) => {
        const demoHomeId =
            process.env.PUBLIC_DEMO_HOME_ID?.trim();

        if (!demoHomeId) {
            return res.json(FALLBACK_DEMO);
        }

        try {
            const demo = await loadPublicDemoHome(
                demoHomeId
            );

            if (!demo) {
                return res.status(503).json({
                    error:
                        "The public demo home is configured but could not be found.",
                });
            }

            return res.json(demo);
        } catch (error) {
            console.error(
                "Could not load public demo home:",
                error
            );

            return res.status(500).json({
                error:
                    "The public demo home could not be loaded.",
            });
        }
    });

    // Authenticated convenience seed retained for local/demo setup.
    // The returned home remains private until its id is assigned to
    // PUBLIC_DEMO_HOME_ID in the backend environment.
    router.post(
        "/demo/seed-indianapolis-ranch",
        requireAuth,
        async (req, res) => {
            const auth0Id =
                getAuthenticatedUserId(req);
            let client;

            try {
                client = await pool.connect();
                await client.query("BEGIN");

                const homeResult = await client.query(
                    `
                    INSERT INTO homes (
                        name,
                        year_built,
                        owner_auth0_id,
                        notes
                    )
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                    `,
                    [
                        "HouseIQ Demo House",
                        1994,
                        auth0Id,
                        "Canonical fictitious HouseIQ demo property with a multi-year document history.",
                    ]
                );

                const home = homeResult.rows[0];

                await client.query(
                    `
                    INSERT INTO home_members (
                        home_id,
                        member_auth0_id,
                        role
                    )
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
                        $1,
                        'single_family',
                        '46220',
                        'Indianapolis',
                        'IN',
                        2,
                        4,
                        2,
                        'forced_air_gas',
                        'central_ac',
                        'asphalt_shingle',
                        'basement',
                        'completed',
                        0
                    )
                    ON CONFLICT (home_id) DO UPDATE SET
                        postal_code = EXCLUDED.postal_code,
                        city = EXCLUDED.city,
                        state = EXCLUDED.state,
                        onboarding_status = 'completed'
                    `,
                    [home.id]
                );

                await client.query("COMMIT");

                return res.status(201).json({
                    message:
                        "Demo home created. Upload the canonical demo documents to this home, then set PUBLIC_DEMO_HOME_ID to its id.",
                    home,
                    publicDemoEnvironmentVariable: {
                        name: "PUBLIC_DEMO_HOME_ID",
                        value: home.id,
                    },
                });
            } catch (error) {
                if (client) {
                    try {
                        await client.query("ROLLBACK");
                    } catch {
                        // Ignore rollback errors; original error is more useful.
                    }
                }

                console.error(
                    "Demo seed failed:",
                    error
                );

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
