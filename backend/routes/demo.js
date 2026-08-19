// backend/routes/demo.js
//
// Public read-only demo backed by a real HouseIQ home.
//
// PUBLIC_DEMO_HOME_ID selects the real home shown to anonymous visitors.
// The demo endpoint intentionally performs no OpenAI work. It returns one
// sanitized snapshot that the frontend can explore entirely in memory.

import { Router } from "express";
import { createHash, randomBytes } from "crypto";

import {
    getAuthenticatedUserId,
    requireAuth,
} from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { demoReadRateLimit, demoLiveRateLimit } from "../middleware/rateLimit.js";
import {
    isMcpConfigured,
} from "../services/mcp/cockroachMcp.js";
import {
    runMemoryAuditor,
} from "../services/ai/memoryAuditor.js";
import {
    runReadOnlyAsk,
} from "../services/ai/runReadOnlyAsk.js";
import {
    JUDGE_ASK_QUESTION,
    JUDGE_AUDIT_QUESTION,
    getPublicDemoHomeId,
} from "../lib/judgeDemo.js";

const DEMO_CACHE_TTL_MS = 30 * 1000;

let demoCache = {
    homeId: null,
    expiresAt: 0,
    payload: null,
};

function priorityScore(priority) {
    const key = String(priority || "medium").toLowerCase();

    if (key === "urgent" || key === "critical") {
        return 92;
    }

    if (key === "high") {
        return 74;
    }

    if (key === "medium") {
        return 61;
    }

    return 40;
}

function timingBucketForPriority(priority) {
    const key = String(priority || "medium").toLowerCase();

    if (key === "urgent" || key === "critical") {
        return "30_days";
    }

    if (key === "high") {
        return "90_days";
    }

    return "365_days";
}

function isRejected(record) {
    return String(
        record?.verification_status || "accepted"
    ).toLowerCase() === "rejected";
}

function isProposed(record) {
    return String(
        record?.verification_status || "accepted"
    ).toLowerCase() === "proposed";
}

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
        onboardingStatus: row.onboarding_status,
        onboardingStep: row.onboarding_step,
    };
}

function buildNeeds({ issues, projects }) {
    const issueNeeds = issues
        .filter((issue) => {
            const status = String(
                issue.status || ""
            ).toLowerCase();

            return status !== "resolved" && status !== "closed";
        })
        .map((issue) => ({
            id: issue.id,
            kind: "issue",
            title: issue.title,
            score: priorityScore(issue.priority),
            priority: issue.priority || "medium",
            timingBucket: timingBucketForPriority(issue.priority),
            sourceLabel:
                issue.source_file_name ||
                issue.source_document_type ||
                "Document",
            evidencePage: issue.evidence_page,
            evidencePassage: issue.evidence_passage,
            explanation:
                issue.description || issue.recommended_next_step,
        }));

    const projectNeeds = projects
        .filter((project) => {
            const status = String(
                project.status || ""
            ).toLowerCase();

            return ![
                "completed",
                "done",
                "cancelled",
                "canceled",
                "closed",
            ].includes(status);
        })
        .map((project) => ({
            id: project.id,
            kind: "project",
            title: project.title,
            score: priorityScore(project.priority),
            priority: project.priority || "medium",
            timingBucket: timingBucketForPriority(project.priority),
            sourceLabel:
                project.source_file_name ||
                project.source_document_type ||
                "Document",
            evidencePage: project.evidence_page,
            evidencePassage: project.evidence_passage,
            explanation: project.description,
        }));

    return [...issueNeeds, ...projectNeeds]
        .sort(
            (a, b) =>
                (b.score || 0) -
                (a.score || 0)
        )
        .slice(0, 10);
}

function buildTimeline({
    documents,
    issues,
    projects,
    assets,
    memories,
    maintenance,
}) {
    const events = [];

    for (const document of documents) {
        events.push({
            id: document.id,
            title:
                document.display_title ||
                document.file_name ||
                "Home document",
            kind: document.document_type || "document",
            occurred_at:
                document.document_date || document.created_at,
            source: "document",
        });
    }

    for (const issue of issues) {
        events.push({
            id: issue.id,
            title: issue.title,
            kind: issue.category || issue.priority || "issue",
            occurred_at: issue.created_at,
            source: "issue",
            evidence_passage: issue.evidence_passage,
        });
    }

    for (const project of projects) {
        events.push({
            id: project.id,
            title: project.title,
            kind: project.status || "project",
            occurred_at: project.created_at,
            source: "project",
            evidence_passage: project.evidence_passage,
        });
    }

    for (const asset of assets) {
        events.push({
            id: asset.id,
            title: asset.name,
            kind: asset.asset_type || "asset",
            occurred_at:
                asset.install_date ||
                asset.purchase_date ||
                asset.created_at,
            source: "asset",
            evidence_passage: asset.evidence_passage,
        });
    }

    for (const memory of memories) {
        events.push({
            id: memory.id,
            title: memory.title,
            kind: memory.category || "memory",
            occurred_at: memory.created_at,
            source: "memory",
            evidence_passage: memory.evidence_passage,
        });
    }

    for (const event of maintenance) {
        events.push({
            id: event.id,
            title:
                event.notes ||
                event.event_type ||
                "Maintenance",
            kind: event.event_type || "maintenance",
            occurred_at:
                event.completed_at || event.created_at,
            source: "maintenance",
        });
    }

    return events
        .filter((event) => event.occurred_at)
        .sort(
            (a, b) =>
                new Date(b.occurred_at) -
                new Date(a.occurred_at)
        )
        .slice(0, 120);
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
            hp.state,
            hp.onboarding_status,
            hp.onboarding_step
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
        projectTasksResult,
        memoriesResult,
        documentsResult,
        maintenanceResult,
        agentRunsResult,
    ] = await Promise.all([
        pool.query(
            `
            SELECT
                a.id,
                a.asset_type,
                a.name,
                a.brand,
                a.model,
                a.serial_number,
                a.install_date,
                a.purchase_date,
                a.warranty_expiration,
                a.last_service_date,
                a.location,
                a.notes,
                a.verification_status,
                a.evidence_passage,
                a.evidence_page,
                a.source_document_id,
                a.created_at,
                a.updated_at,
                d.file_name AS source_file_name,
                d.document_type AS source_document_type
            FROM home_assets a
            LEFT JOIN documents d
                ON d.id = a.source_document_id
            WHERE a.home_id = $1
              AND a.source_document_id IS NOT NULL
              AND COALESCE(
                    a.verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY
                COALESCE(
                    a.install_date,
                    a.purchase_date
                ) DESC NULLS LAST,
                a.created_at DESC
            LIMIT 150
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                i.id,
                i.title,
                i.description,
                i.status,
                i.priority,
                i.category,
                i.suspected_cause,
                i.recommended_next_step,
                i.verification_status,
                i.evidence_passage,
                i.evidence_page,
                i.source_document_id,
                i.created_at,
                i.updated_at,
                d.file_name AS source_file_name,
                d.document_type AS source_document_type
            FROM home_issues i
            LEFT JOIN documents d
                ON d.id = i.source_document_id
            WHERE i.home_id = $1
              AND i.source_document_id IS NOT NULL
              AND COALESCE(
                    i.verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY
                CASE i.priority
                    WHEN 'urgent' THEN 1
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                END,
                i.created_at DESC
            LIMIT 150
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                p.id,
                p.title,
                p.description,
                p.status,
                p.priority,
                p.estimated_cost_low,
                p.estimated_cost_high,
                p.diy_difficulty,
                p.safety_notes,
                p.verification_status,
                p.evidence_passage,
                p.evidence_page,
                p.source_document_id,
                p.created_at,
                p.updated_at,
                d.file_name AS source_file_name,
                d.document_type AS source_document_type
            FROM home_projects p
            LEFT JOIN documents d
                ON d.id = p.source_document_id
            WHERE p.home_id = $1
              AND p.source_document_id IS NOT NULL
              AND COALESCE(
                    p.verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY p.created_at DESC
            LIMIT 150
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                t.id,
                t.project_id,
                t.task_order,
                t.title,
                t.description,
                t.status,
                t.created_at,
                t.updated_at
            FROM project_tasks t
            INNER JOIN home_projects p
                ON p.id = t.project_id
            WHERE p.home_id = $1
              AND p.source_document_id IS NOT NULL
              AND COALESCE(
                    p.verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY
                t.project_id,
                t.task_order ASC
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                m.id,
                m.title,
                m.category,
                m.content,
                m.importance,
                m.verification_status,
                m.evidence_passage,
                m.evidence_page,
                m.source_document_id,
                m.created_at,
                m.updated_at,
                d.file_name AS source_file_name,
                d.document_type AS source_document_type
            FROM memories m
            LEFT JOIN documents d
                ON d.id = m.source_document_id
            WHERE m.home_id = $1
              AND m.source_document_id IS NOT NULL
              AND COALESCE(
                    m.verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY
                m.importance DESC,
                m.created_at DESC
            LIMIT 150
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
                metadata->>'displayTitle' AS display_title,
                metadata->>'documentDate' AS document_date,
                metadata->>'contractorOrCompany'
                    AS contractor_or_company,
                metadata->>'totalAmount' AS total_amount,
                created_at,
                updated_at
            FROM documents
            WHERE home_id = $1
            ORDER BY created_at DESC
            LIMIT 250
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                id,
                asset_id,
                event_type,
                completed_at,
                next_due_at,
                contractor,
                cost,
                notes,
                source_document_id,
                verification_status,
                created_at,
                updated_at
            FROM maintenance_events
            WHERE home_id = $1
              AND source_document_id IS NOT NULL
              AND COALESCE(
                    verification_status,
                    'accepted'
                  ) <> 'rejected'
            ORDER BY
                COALESCE(
                    completed_at,
                    created_at::DATE
                ) DESC
            LIMIT 100
            `,
            [homeId]
        ).catch(() => ({ rows: [] })),
        pool.query(
            `
            SELECT
                id,
                user_question,
                answer,
                status,
                confidence,
                needs_more_info,
                clarifying_questions,
                actions_taken,
                created_at
            FROM agent_runs
            WHERE home_id = $1
              AND status = 'completed'
              AND answer IS NOT NULL
              AND length(trim(answer)) > 0
            ORDER BY created_at DESC
            LIMIT 12
            `,
            [homeId]
        ),
    ]);

    const projectTasksByProject = new Map();

    for (const task of projectTasksResult.rows) {
        const list =
            projectTasksByProject.get(task.project_id) || [];

        list.push(task);
        projectTasksByProject.set(task.project_id, list);
    }

    const assets = assetsResult.rows.filter(
        (row) => !isRejected(row)
    );

    const issues = issuesResult.rows.filter(
        (row) => !isRejected(row)
    );

    const projects = projectsResult.rows
        .filter((row) => !isRejected(row))
        .map((project) => ({
            ...project,
            tasks:
                projectTasksByProject.get(project.id) || [],
        }));

    const memories = memoriesResult.rows.filter(
        (row) => !isRejected(row)
    );

    const documents = documentsResult.rows;

    const maintenance = maintenanceResult.rows.filter(
        (row) => !isRejected(row)
    );

    const agentRuns = agentRunsResult.rows;

    const proposals = {
        memories: memories.filter(isProposed),
        issues: issues.filter(isProposed),
        projects: projects.filter(isProposed),
        assets: assets.filter(isProposed),
    };

    proposals.total =
        proposals.memories.length +
        proposals.issues.length +
        proposals.projects.length +
        proposals.assets.length;

    const needs = buildNeeds({
        issues: issues.filter((row) => !isProposed(row)),
        projects: projects.filter((row) => !isProposed(row)),
    });

    const timeline = buildTimeline({
        documents,
        issues,
        projects,
        assets,
        memories,
        maintenance,
    });

    return {
        source: "database",
        readOnly: true,
        aiMode: "replay",
        home: {
            id: homeRow.id,
            name: homeRow.name,
            year_built: homeRow.year_built,
            notes: homeRow.notes,
            created_at: homeRow.created_at,
            updated_at: homeRow.updated_at,
        },
        profile: profileFromRow(homeRow),
        stats: {
            documents: documents.length,
            assets: assets.length,
            issues: issues.length,
            projects: projects.length,
            memories: memories.length,
            maintenance: maintenance.length,
            savedAnswers: agentRuns.length,
            proposals: proposals.total,
        },
        needs,
        proposals,
        timeline,
        agentRuns,
        assets,
        issues,
        projects,
        memories,
        documents,
        maintenance,
    };
}

async function getCachedPublicDemoHome(homeId) {
    const now = Date.now();

    if (
        demoCache.payload &&
        demoCache.homeId === homeId &&
        demoCache.expiresAt > now
    ) {
        return demoCache.payload;
    }

    const payload = await loadPublicDemoHome(homeId);

    demoCache = {
        homeId,
        expiresAt: now + DEMO_CACHE_TTL_MS,
        payload,
    };

    return payload;
}

export function createDemoRouter() {
    const router = Router();

    router.get(
        "/demo/home",
        demoReadRateLimit,
        async (_req, res) => {
            const demoHomeId =
                process.env.PUBLIC_DEMO_HOME_ID?.trim();

            if (!demoHomeId) {
                return res.status(503).json({
                    error:
                        "The public demo home is not configured.",
                });
            }

            try {
                const demo = await getCachedPublicDemoHome(
                    demoHomeId
                );

                if (!demo) {
                    return res.status(503).json({
                        error:
                            "The configured public demo home could not be found.",
                    });
                }

                res.set(
                    "Cache-Control",
                    "public, max-age=30, stale-while-revalidate=120"
                );

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
        }
    );

    // Backward-compatible local setup endpoint. Unlike the old demo seed,
    // this creates only an empty home shell. No fake issues/assets are
    // inserted; the demo becomes interesting only after documents are uploaded.
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
                        "Document-backed HouseIQ demo home. Upload real demo fixtures to build its history.",
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

                await client.query("COMMIT");

                return res.status(201).json({
                    message:
                        "Empty document-backed demo home created. Upload documents next.",
                    home,
                });
            } catch (error) {
                if (client) {
                    try {
                        await client.query("ROLLBACK");
                    } catch {
                        /* ignore rollback failure */
                    }
                }

                console.error(
                    "Document-backed demo seed failed:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Failed to create demo home",
                });
            } finally {
                client?.release();
            }
        }
    );

    router.post(
        "/demo/live/ask",
        demoLiveRateLimit,
        async (_req, res) => {
            const demoHomeId = getPublicDemoHomeId();

            if (!demoHomeId) {
                return res.status(404).json({
                    error:
                        "The public demo home is not configured.",
                });
            }

            try {
                const result = await runReadOnlyAsk({
                    homeId: demoHomeId,
                    question: JUDGE_ASK_QUESTION,
                });

                return res.json({
                    ...result,
                    question: JUDGE_ASK_QUESTION,
                });
            } catch (error) {
                if (error.code === "HOME_NOT_FOUND") {
                    return res.status(404).json({
                        error: "Home not found",
                    });
                }

                console.error(
                    "Public live Ask failed:",
                    error
                );
                return res.status(500).json({
                    error:
                        "HouseIQ could not run the live memory query.",
                });
            }
        }
    );

    router.post(
        "/demo/live/audit",
        demoLiveRateLimit,
        async (_req, res) => {
            const demoHomeId = getPublicDemoHomeId();

            if (!demoHomeId) {
                return res.status(404).json({
                    error:
                        "The public demo home is not configured.",
                });
            }

            if (!isMcpConfigured()) {
                return res.status(503).json({
                    error:
                        "CockroachDB Cloud MCP is not configured",
                });
            }

            try {
                const homeResult = await pool.query(
                    `SELECT id, name FROM homes WHERE id = $1`,
                    [demoHomeId]
                );
                const home = homeResult.rows[0] || {
                    id: demoHomeId,
                    name: null,
                };

                const auditorResult = await runMemoryAuditor({
                    question: JUDGE_AUDIT_QUESTION,
                    homeId: demoHomeId,
                    homeName: home.name,
                });

                const agentRunResult = await pool.query(
                    `
                    INSERT INTO agent_runs (
                        home_id,
                        user_question,
                        answer,
                        status,
                        confidence,
                        needs_more_info,
                        clarifying_questions,
                        memories_used,
                        actions_taken,
                        run_kind,
                        tool_trace
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7::JSONB, $8::JSONB, $9::JSONB, $10, $11::JSONB
                    )
                    RETURNING id
                    `,
                    [
                        demoHomeId,
                        JUDGE_AUDIT_QUESTION,
                        auditorResult.answer,
                        "completed",
                        "medium",
                        false,
                        JSON.stringify([]),
                        JSON.stringify([]),
                        JSON.stringify([]),
                        "memory_audit",
                        JSON.stringify(
                            auditorResult.toolTrace || []
                        ),
                    ]
                );

                return res.json({
                    question: JUDGE_AUDIT_QUESTION,
                    home: {
                        id: home.id,
                        name: home.name,
                    },
                    answer: auditorResult.answer,
                    toolTrace: auditorResult.toolTrace,
                    model: auditorResult.model,
                    durationMs: auditorResult.durationMs,
                    via: "cockroachdb-cloud-mcp",
                    agentRunId: agentRunResult.rows[0]?.id,
                });
            } catch (error) {
                console.error(
                    "Public live MCP audit failed:",
                    error
                );
                return res.status(500).json({
                    error:
                        "HouseIQ could not run the live MCP audit.",
                });
            }
        }
    );

    return router;
}

/**
 * Creates a hashed invite token for home_invites.
 *
 * This helper remains here for backward compatibility with homes.js.
 * It is unrelated to the public demo request path.
 */
export function createInviteToken() {
    const token = randomBytes(24).toString("hex");

    const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

    return { token, tokenHash };
}
