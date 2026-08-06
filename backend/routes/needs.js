// backend/routes/needs.js

import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { requireHomeAccess } from "../middleware/ownership.js";
import { seasonalNeedHints } from "../lib/climateZones.js";
import { lifecycleNeedItems } from "../lib/assetServiceIntervals.js";

const PRIORITY_WEIGHT = {
    urgent: 1,
    critical: 1,
    high: 0.8,
    medium: 0.55,
    low: 0.35,
};

const SAFETY_CATEGORIES = new Set([
    "electrical",
    "gas",
    "structural",
    "fire",
    "safety",
    "plumbing",
]);

function scoreNeed(item) {
    const urgency =
        PRIORITY_WEIGHT[item.priority] ?? 0.5;
    const safety =
        item.kind === "issue" &&
        SAFETY_CATEGORIES.has(
            String(item.category || "").toLowerCase()
        )
            ? 1
            : item.kind === "issue"
              ? 0.6
              : 0.4;
    const failureLikelihood =
        item.kind === "lifecycle" ? 0.7 : 0.5;
    const costOfDelay =
        item.priority === "urgent" ||
        item.priority === "high"
            ? 0.85
            : 0.5;
    const confidence = item.confidence ?? 0.7;

    const raw =
        100 *
        (0.3 * safety +
            0.25 * urgency +
            0.2 * failureLikelihood +
            0.15 * costOfDelay +
            0.1 * confidence);

    return Math.round(Math.min(99, Math.max(1, raw)));
}

function timingBucketFor(item, score) {
    if (item.timingBucket) {
        return item.timingBucket;
    }
    if (
        score >= 80 ||
        item.priority === "urgent" ||
        item.priority === "critical"
    ) {
        return "30_days";
    }
    if (score >= 60 || item.priority === "high") {
        return "90_days";
    }
    if (score >= 40) {
        return "365_days";
    }
    return "monitor";
}

function enrich(item) {
    const score = scoreNeed(item);
    const timingBucket = timingBucketFor(item, score);
    const explanation =
        item.explanation ||
        item.reason ||
        "Ranked from home records and seasonal context.";

    return {
        ...item,
        score,
        timingBucket,
        explanation,
    };
}

export function createNeedsRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/needs",
        requireAuth,
        requireHomeAccess({ minRole: "viewer" }),
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const [
                    profileResult,
                    issuesResult,
                    projectsResult,
                    assetsResult,
                ] = await Promise.all([
                    pool.query(
                        `
                        SELECT *
                        FROM home_profiles
                        WHERE home_id = $1
                        LIMIT 1
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, priority, status, category,
                               evidence_passage, evidence_page,
                               source_document_id
                        FROM home_issues
                        WHERE home_id = $1
                          AND status NOT IN ('resolved', 'closed')
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY updated_at DESC
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT id, title, priority, status,
                               evidence_passage, evidence_page,
                               source_document_id
                        FROM home_projects
                        WHERE home_id = $1
                          AND status NOT IN ('completed', 'cancelled')
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        ORDER BY updated_at DESC
                        `,
                        [homeId]
                    ),
                    pool.query(
                        `
                        SELECT
                            id,
                            name,
                            asset_type,
                            install_date,
                            purchase_date,
                            last_service_date,
                            warranty_expiration
                        FROM home_assets
                        WHERE home_id = $1
                          AND COALESCE(verification_status, 'accepted') = 'accepted'
                        `,
                        [homeId]
                    ),
                ]);

                const profile =
                    profileResult.rows[0] || null;

                // Merge latest maintenance event dates onto assets.
                try {
                    const maintenance = await pool.query(
                        `
                        SELECT DISTINCT ON (asset_id)
                            asset_id,
                            completed_at,
                            next_due_at
                        FROM maintenance_events
                        WHERE home_id = $1
                          AND asset_id IS NOT NULL
                        ORDER BY asset_id, completed_at DESC NULLS LAST
                        `,
                        [homeId]
                    );

                    const byAsset = new Map(
                        maintenance.rows.map((row) => [
                            row.asset_id,
                            row,
                        ])
                    );

                    for (const asset of assetsResult.rows) {
                        const event = byAsset.get(asset.id);
                        if (!event) {
                            continue;
                        }
                        if (
                            event.completed_at &&
                            !asset.last_service_date
                        ) {
                            asset.last_service_date =
                                event.completed_at;
                        }
                        asset.next_due_at = event.next_due_at;
                    }
                } catch {
                    /* maintenance_events may be unavailable */
                }

                const items = [];

                for (const issue of issuesResult.rows) {
                    items.push(
                        enrich({
                            kind: "issue",
                            id: issue.id,
                            title: issue.title,
                            category: issue.category,
                            reason:
                                `Open ${issue.priority || "medium"}-priority issue` +
                                (issue.category
                                    ? ` (${issue.category})`
                                    : ""),
                            priority:
                                issue.priority || "medium",
                            evidencePassage:
                                issue.evidence_passage,
                            evidencePage:
                                issue.evidence_page,
                            sourceDocumentId:
                                issue.source_document_id,
                            confidence: issue.evidence_passage
                                ? 0.9
                                : 0.7,
                            sourceHints: ["issue"],
                        })
                    );
                }

                for (const project of projectsResult.rows) {
                    items.push(
                        enrich({
                            kind: "project",
                            id: project.id,
                            title: project.title,
                            reason: `Active project (${project.status})`,
                            priority:
                                project.priority || "medium",
                            evidencePassage:
                                project.evidence_passage,
                            evidencePage:
                                project.evidence_page,
                            sourceDocumentId:
                                project.source_document_id,
                            confidence: 0.65,
                            sourceHints: ["project"],
                        })
                    );
                }

                items.push(
                    ...lifecycleNeedItems(
                        assetsResult.rows
                    ).map((item) =>
                        enrich({
                            ...item,
                            confidence: item.confidence || 0.55,
                        })
                    )
                );

                items.push(
                    ...seasonalNeedHints({
                        postalCode: profile?.postal_code,
                        state: profile?.state,
                    }).map((hint) =>
                        enrich({
                            kind: "seasonal",
                            ...hint,
                            confidence: 0.5,
                            sourceHints: ["seasonal"],
                        })
                    )
                );

                items.sort((a, b) => {
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }
                    return 0;
                });

                const limited = items.slice(0, 20);
                const buckets = {
                    "30_days": [],
                    "90_days": [],
                    "365_days": [],
                    monitor: [],
                };

                for (const item of limited) {
                    const key =
                        buckets[item.timingBucket]
                            ? item.timingBucket
                            : "monitor";
                    buckets[key].push(item);
                }

                return res.json({
                    items: limited,
                    buckets,
                    generatedAt: new Date().toISOString(),
                });
            } catch (error) {
                console.error(
                    "Error building needs board:",
                    error
                );

                return res.status(500).json({
                    error:
                        "Failed to load what this house needs",
                });
            }
        }
    );

    return router;
}
