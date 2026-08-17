// backend/services/entityResolution.js
//
// Resolve incoming memories/issues/projects/assets against
// records the house already has. High-confidence matches attach
// another document as evidence on the canonical row. Ambiguous
// matches still create a record, then flag the pair for review.

import { pool } from "../db/pool.js";

import {
    assetIdentityKey,
    classifyMatchScore,
    extractEventId,
    extractSystemKey,
    extractWorkFamily,
    extractYear,
    jaccard,
    normalizeText,
    recordTextBlob,
    recordTitle,
} from "../lib/entityKeys.js";

export const RECORD_KIND_TABLES = {
    memory: "memories",
    issue: "home_issues",
    project: "home_projects",
    asset: "home_assets",
};

export async function loadRecordCatalog(homeId, db = pool) {
    const [memories, issues, projects, assets] =
        await Promise.all([
            db.query(
                `
                SELECT *
                FROM memories
                WHERE home_id = $1
                  AND COALESCE(verification_status, 'accepted') <> 'rejected'
                  AND merged_into_id IS NULL
                `,
                [homeId]
            ),
            db.query(
                `
                SELECT *
                FROM home_issues
                WHERE home_id = $1
                  AND COALESCE(verification_status, 'accepted') <> 'rejected'
                  AND merged_into_id IS NULL
                `,
                [homeId]
            ),
            db.query(
                `
                SELECT *
                FROM home_projects
                WHERE home_id = $1
                  AND COALESCE(verification_status, 'accepted') <> 'rejected'
                  AND merged_into_id IS NULL
                `,
                [homeId]
            ),
            db.query(
                `
                SELECT *
                FROM home_assets
                WHERE home_id = $1
                  AND COALESCE(verification_status, 'accepted') <> 'rejected'
                  AND merged_into_id IS NULL
                `,
                [homeId]
            ),
        ]);

    return {
        memories: memories.rows,
        issues: issues.rows,
        projects: projects.rows,
        assets: assets.rows,
    };
}

function eventIdFrom(row, fileName) {
    return (
        extractEventId(fileName) ||
        extractEventId(row?.file_name || row?.fileName) ||
        extractEventId(row?.metadata?.eventId) ||
        extractEventId(row?.metadata?.fileName) ||
        extractEventId(recordTextBlob(row))
    );
}

function scoreSharedIdentity(candidate, existing, fileName) {
    const candidateText = `${recordTextBlob(candidate)} ${fileName || ""}`;
    const existingText = recordTextBlob(existing);

    let score = 0;
    const reasons = [];

    const candidateEvent = eventIdFrom(candidate, fileName);
    const existingEvent = eventIdFrom(existing);

    if (candidateEvent && existingEvent) {
        if (candidateEvent === existingEvent) {
            score += 0.5;
            reasons.push(`same event ${candidateEvent}`);
        } else {
            score -= 0.08;
        }
    }

    const candidateSystem = extractSystemKey(candidateText);
    const existingSystem = extractSystemKey(existingText);

    if (candidateSystem && existingSystem) {
        if (candidateSystem === existingSystem) {
            score += 0.28;
            reasons.push(`same system ${candidateSystem}`);
        } else {
            score -= 0.5;
            reasons.push(
                `different systems ${candidateSystem} vs ${existingSystem}`
            );
        }
    }

    const candidateWork = extractWorkFamily(candidateText);
    const existingWork = extractWorkFamily(existingText);

    if (candidateWork && existingWork) {
        if (candidateWork === existingWork) {
            score += 0.18;
            reasons.push(`same work ${candidateWork}`);
        } else if (
            candidateWork === "replacement" &&
            existingWork === "replacement"
        ) {
            score += 0.18;
        } else {
            score -= 0.12;
        }
    }

    const titleScore = jaccard(
        recordTitle(candidate),
        recordTitle(existing)
    );
    score += titleScore * 0.22;

    if (
        normalizeText(recordTitle(candidate)) &&
        normalizeText(recordTitle(candidate)) ===
            normalizeText(recordTitle(existing))
    ) {
        score += 0.35;
        reasons.push("same title");
    }

    const yearA = extractYear(candidateText);
    const yearB = extractYear(existingText);
    if (yearA && yearB && yearA === yearB) {
        score += 0.06;
    }

    return {
        score: Math.max(0, Math.min(1, score)),
        reasons,
        candidateSystem,
        existingSystem,
    };
}

export function scoreAssetMatch(candidate, existing, fileName) {
    const candidateKey = assetIdentityKey(candidate);
    const existingKey = assetIdentityKey(existing);

    if (candidateKey && existingKey && candidateKey === existingKey) {
        return {
            score: 1,
            confidence: "exact",
            reasons: ["same asset identity"],
        };
    }

    const shared = scoreSharedIdentity(
        candidate,
        existing,
        fileName
    );

    const typeA = String(
        candidate.assetType ||
        candidate.asset_type ||
        ""
    ).toLowerCase();
    const typeB = String(
        existing.asset_type ||
        existing.assetType ||
        ""
    ).toLowerCase();

    if (typeA && typeB && typeA === typeB) {
        shared.score += 0.12;
        shared.reasons.push("same asset type");
    }

    // Later invoices should extend the same furnace / AC / roof
    // instead of creating a twin asset for each service year.
    const persistentSystems = new Set([
        "furnace",
        "ac",
        "water_heater",
        "roof",
        "basement_water",
        "sewer",
    ]);

    if (
        shared.candidateSystem &&
        shared.candidateSystem === shared.existingSystem &&
        persistentSystems.has(shared.candidateSystem)
    ) {
        shared.score = Math.max(shared.score, 0.72);
        shared.reasons.push(
            `same persistent equipment ${shared.candidateSystem}`
        );
    }

    const confidence = classifyMatchScore(shared.score);
    return {
        score: shared.score,
        confidence,
        reasons: shared.reasons,
    };
}

export function scoreIssueMatch(candidate, existing, fileName) {
    const shared = scoreSharedIdentity(
        candidate,
        existing,
        fileName
    );
    const confidence = classifyMatchScore(shared.score);
    return {
        score: shared.score,
        confidence,
        reasons: shared.reasons,
    };
}

export function scoreProjectMatch(candidate, existing, fileName) {
    const shared = scoreSharedIdentity(
        candidate,
        existing,
        fileName
    );

    // Competing quotes and the accepted replacement are one job.
    if (
        shared.candidateSystem &&
        shared.candidateSystem === shared.existingSystem &&
        extractWorkFamily(
            `${recordTextBlob(candidate)} ${fileName || ""}`
        ) === "replacement" &&
        extractWorkFamily(recordTextBlob(existing)) ===
            "replacement"
    ) {
        shared.score = Math.max(shared.score, 0.72);
        shared.reasons.push(
            "same-system replacement evidence"
        );
    }

    const confidence = classifyMatchScore(shared.score);
    return {
        score: shared.score,
        confidence,
        reasons: shared.reasons,
    };
}

export function scoreMemoryMatch(candidate, existing, fileName) {
    const shared = scoreSharedIdentity(
        candidate,
        existing,
        fileName
    );
    const contentScore = jaccard(
        candidate.content || candidate.description || "",
        existing.content || existing.description || ""
    );
    shared.score += contentScore * 0.2;

    const confidence = classifyMatchScore(
        Math.min(1, shared.score)
    );
    return {
        score: Math.min(1, shared.score),
        confidence,
        reasons: shared.reasons,
    };
}

const SCORERS = {
    asset: scoreAssetMatch,
    issue: scoreIssueMatch,
    project: scoreProjectMatch,
    memory: scoreMemoryMatch,
};

export function resolveCandidate(
    kind,
    candidate,
    existingRows = [],
    { fileName } = {}
) {
    const scorer = SCORERS[kind];
    if (!scorer || !existingRows.length) {
        return {
            action: "create",
            match: null,
            confidence: "none",
            score: 0,
            reasons: [],
        };
    }

    let best = null;

    for (const existing of existingRows) {
        if (
            existing.merged_into_id ||
            existing.mergedIntoId
        ) {
            continue;
        }

        const result = scorer(
            candidate,
            existing,
            fileName
        );

        const sameTitle =
            normalizeText(recordTitle(candidate)).length >
                3 &&
            normalizeText(recordTitle(candidate)) ===
                normalizeText(recordTitle(existing));

        if (sameTitle) {
            result.score = Math.max(result.score, 0.86);
            result.confidence = classifyMatchScore(
                result.score
            );
            result.reasons = [
                ...(result.reasons || []),
                "same title",
            ];
        }

        if (!best || result.score > best.score) {
            best = {
                ...result,
                match: existing,
            };
        }
    }

    if (!best || best.confidence === "none") {
        return {
            action: "create",
            match: null,
            confidence: "none",
            score: best?.score || 0,
            reasons: best?.reasons || [],
        };
    }

    if (
        best.confidence === "exact" ||
        best.confidence === "likely"
    ) {
        return {
            action: "link",
            match: best.match,
            confidence: best.confidence,
            score: best.score,
            reasons: best.reasons,
        };
    }

    return {
        action: "flag",
        match: best.match,
        confidence: "questionable",
        score: best.score,
        reasons: best.reasons,
    };
}

export async function attachRecordEvidence({
    homeId,
    recordKind,
    recordId,
    documentId = null,
    chunkId = null,
    passage = null,
    page = null,
    matchConfidence = "exact",
    reviewStatus = "attached",
    metadata = {},
    client = pool,
}) {
    if (!homeId || !recordKind || !recordId || !documentId) {
        return null;
    }

    try {
        const result = await client.query(
            `
            INSERT INTO record_evidence (
                home_id,
                record_kind,
                record_id,
                document_id,
                chunk_id,
                passage,
                page,
                match_confidence,
                review_status,
                metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB
            )
            ON CONFLICT (record_kind, record_id, document_id)
            DO NOTHING
            RETURNING *
            `,
            [
                homeId,
                recordKind,
                recordId,
                documentId,
                chunkId,
                passage,
                Number.isInteger(page) ? page : null,
                matchConfidence,
                reviewStatus,
                JSON.stringify(metadata),
            ]
        );

        return result.rows[0] || null;
    } catch (error) {
        console.warn(
            "record_evidence insert skipped:",
            error.message
        );
        return null;
    }
}

export async function flagPossibleDuplicate({
    homeId,
    recordKind,
    recordId,
    canonicalRecordId,
    score,
    reason,
    client = pool,
}) {
    if (
        !homeId ||
        !recordKind ||
        !recordId ||
        !canonicalRecordId ||
        recordId === canonicalRecordId
    ) {
        return null;
    }

    try {
        const result = await client.query(
            `
            INSERT INTO record_duplicate_flags (
                home_id,
                record_kind,
                record_id,
                canonical_record_id,
                score,
                reason,
                status
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, 'open'
            )
            ON CONFLICT (
                record_kind,
                record_id,
                canonical_record_id
            )
            DO NOTHING
            RETURNING *
            `,
            [
                homeId,
                recordKind,
                recordId,
                canonicalRecordId,
                score,
                String(reason || "").slice(0, 400),
            ]
        );

        return result.rows[0] || null;
    } catch (error) {
        console.warn(
            "duplicate flag insert skipped:",
            error.message
        );
        return null;
    }
}

export async function resolveOrCreateRecord({
    kind,
    input,
    existing,
    create,
    homeId,
    documentId = null,
    fileName = null,
    evidencePassage = null,
    evidencePage = null,
    chunkId = null,
    client = pool,
}) {
    const decision = resolveCandidate(
        kind,
        input,
        existing,
        { fileName }
    );

    if (decision.action === "link" && decision.match) {
        await attachRecordEvidence({
            homeId,
            recordKind: kind,
            recordId: decision.match.id,
            documentId,
            chunkId,
            passage: evidencePassage,
            page: evidencePage,
            matchConfidence: decision.confidence,
            reviewStatus: "attached",
            metadata: {
                reasons: decision.reasons,
                score: decision.score,
            },
            client,
        });

        return {
            record: decision.match,
            action: "linked",
            confidence: decision.confidence,
            reasons: decision.reasons,
        };
    }

    const created = await create();
    existing.push(created);

    await attachRecordEvidence({
        homeId,
        recordKind: kind,
        recordId: created.id,
        documentId,
        chunkId,
        passage: evidencePassage,
        page: evidencePage,
        matchConfidence: "exact",
        reviewStatus: "attached",
        metadata: {
            source: "created",
        },
        client,
    });

    if (decision.action === "flag" && decision.match) {
        await flagPossibleDuplicate({
            homeId,
            recordKind: kind,
            recordId: created.id,
            canonicalRecordId: decision.match.id,
            score: decision.score,
            reason: decision.reasons.join("; "),
            client,
        });

        return {
            record: created,
            action: "created_flagged",
            confidence: "questionable",
            reasons: decision.reasons,
            possibleDuplicateOf: decision.match,
        };
    }

    return {
        record: created,
        action: "created",
        confidence: "none",
        reasons: [],
    };
}

export async function attachEvidenceToRows(
    rows,
    recordKind,
    homeId,
    db = pool
) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return rows;
    }

    try {
        const result = await db.query(
            `
            SELECT
                record_evidence.record_id,
                record_evidence.document_id,
                record_evidence.passage,
                record_evidence.page,
                record_evidence.match_confidence,
                documents.file_name,
                documents.document_type
            FROM record_evidence
            LEFT JOIN documents
                ON documents.id = record_evidence.document_id
            WHERE record_evidence.home_id = $1
              AND record_evidence.record_kind = $2
              AND record_evidence.record_id = ANY($3::UUID[])
              AND record_evidence.review_status = 'attached'
            ORDER BY record_evidence.created_at ASC
            `,
            [
                homeId,
                recordKind,
                rows.map((row) => row.id),
            ]
        );

        const byRecordId = new Map();
        for (const evidence of result.rows) {
            const list =
                byRecordId.get(evidence.record_id) || [];
            list.push({
                documentId: evidence.document_id,
                fileName: evidence.file_name,
                documentType: evidence.document_type,
                passage: evidence.passage,
                page: evidence.page,
                matchConfidence: evidence.match_confidence,
            });
            byRecordId.set(evidence.record_id, list);
        }

        return rows.map((row) => ({
            ...row,
            evidence:
                byRecordId.get(row.id) || [],
        }));
    } catch (error) {
        console.warn(
            "record_evidence lookup skipped:",
            error.message
        );
        return rows;
    }
}

function chooseCanonical(left, right) {
    const leftAccepted =
        (left.verification_status || "accepted") ===
        "accepted"
            ? 1
            : 0;
    const rightAccepted =
        (right.verification_status || "accepted") ===
        "accepted"
            ? 1
            : 0;

    if (leftAccepted !== rightAccepted) {
        return leftAccepted > rightAccepted
            ? left
            : right;
    }

    const leftTime = Date.parse(left.created_at) || 0;
    const rightTime = Date.parse(right.created_at) || 0;
    return leftTime <= rightTime ? left : right;
}

async function mergeDuplicate({
    kind,
    canonical,
    duplicate,
    homeId,
    score,
    reasons,
    documentsById,
    client,
}) {
    const table = RECORD_KIND_TABLES[kind];
    if (!table || canonical.id === duplicate.id) {
        return false;
    }

    await client.query(
        `
        UPDATE ${table}
        SET merged_into_id = $1,
            updated_at = now()
        WHERE id = $2
          AND home_id = $3
          AND merged_into_id IS NULL
        `,
        [canonical.id, duplicate.id, homeId]
    );

    const documentId =
        duplicate.source_document_id || null;
    const document = documentId
        ? documentsById.get(documentId)
        : null;

    await attachRecordEvidence({
        homeId,
        recordKind: kind,
        recordId: canonical.id,
        documentId,
        passage:
            duplicate.evidence_passage ||
            duplicate.content ||
            duplicate.description ||
            null,
        page: duplicate.evidence_page || null,
        matchConfidence:
            score >= 0.78 ? "exact" : "likely",
        reviewStatus: "attached",
        metadata: {
            mergedFrom: duplicate.id,
            reasons,
            fileName: document?.file_name,
        },
        client,
    });

    await client.query(
        `
        UPDATE record_evidence
        SET record_id = $1
        WHERE home_id = $2
          AND record_kind = $3
          AND record_id = $4
        `,
        [canonical.id, homeId, kind, duplicate.id]
    ).catch(() => {});

    return true;
}

/**
 * Group likely duplicates already stored for a home.
 * Never deletes. Questionable pairs are flagged.
 */
export async function reconcileHomeRecords(
    homeId,
    db = pool
) {
    const summary = {
        linked: 0,
        flagged: 0,
        scanned: 0,
    };

    const documentsResult = await db.query(
        `
        SELECT id, file_name, document_type
        FROM documents
        WHERE home_id = $1
        `,
        [homeId]
    );
    const documentsById = new Map(
        documentsResult.rows.map((row) => [row.id, row])
    );

    const kinds = [
        ["asset", "home_assets"],
        ["issue", "home_issues"],
        ["project", "home_projects"],
        ["memory", "memories"],
    ];

    for (const [kind, table] of kinds) {
        const result = await db.query(
            `
            SELECT *
            FROM ${table}
            WHERE home_id = $1
              AND COALESCE(verification_status, 'accepted') <> 'rejected'
              AND merged_into_id IS NULL
            ORDER BY created_at ASC
            `,
            [homeId]
        );

        const rows = result.rows;
        summary.scanned += rows.length;

        for (let i = 0; i < rows.length; i += 1) {
            const left = rows[i];
            if (left.merged_into_id) {
                continue;
            }

            for (let j = i + 1; j < rows.length; j += 1) {
                const right = rows[j];
                if (right.merged_into_id) {
                    continue;
                }

                const fileName =
                    documentsById.get(
                        right.source_document_id
                    )?.file_name ||
                    documentsById.get(
                        left.source_document_id
                    )?.file_name;

                const decision = resolveCandidate(
                    kind,
                    {
                        ...right,
                        file_name:
                            documentsById.get(
                                right.source_document_id
                            )?.file_name,
                    },
                    [left],
                    { fileName }
                );

                if (decision.action === "link") {
                    const canonical = chooseCanonical(
                        left,
                        right
                    );
                    const duplicate =
                        canonical.id === left.id
                            ? right
                            : left;

                    const merged = await mergeDuplicate({
                        kind,
                        canonical,
                        duplicate,
                        homeId,
                        score: decision.score,
                        reasons: decision.reasons,
                        documentsById,
                        client: db,
                    });

                    if (merged) {
                        duplicate.merged_into_id =
                            canonical.id;
                        summary.linked += 1;
                    }
                } else if (decision.action === "flag") {
                    const flagged =
                        await flagPossibleDuplicate({
                            homeId,
                            recordKind: kind,
                            recordId: right.id,
                            canonicalRecordId: left.id,
                            score: decision.score,
                            reason: decision.reasons.join(
                                "; "
                            ),
                            client: db,
                        });

                    if (flagged) {
                        summary.flagged += 1;
                    }
                }
            }
        }
    }

    return summary;
}

export async function reviewDuplicateFlag({
    homeId,
    flagId,
    status,
    db = pool,
}) {
    const flagResult = await db.query(
        `
        SELECT *
        FROM record_duplicate_flags
        WHERE id = $1
          AND home_id = $2
        LIMIT 1
        `,
        [flagId, homeId]
    );

    const flag = flagResult.rows[0];
    if (!flag) {
        return null;
    }

    if (status === "distinct") {
        await db.query(
            `
            UPDATE record_duplicate_flags
            SET status = 'distinct',
                updated_at = now()
            WHERE id = $1
            `,
            [flagId]
        );
        return { ...flag, status: "distinct" };
    }

    if (status !== "same") {
        throw new Error("Status must be same or distinct");
    }

    const documentsResult = await db.query(
        `
        SELECT id, file_name, document_type
        FROM documents
        WHERE home_id = $1
        `,
        [homeId]
    );
    const documentsById = new Map(
        documentsResult.rows.map((row) => [row.id, row])
    );

    const table = RECORD_KIND_TABLES[flag.record_kind];
    const records = await db.query(
        `
        SELECT *
        FROM ${table}
        WHERE home_id = $1
          AND id = ANY($2::UUID[])
        `,
        [
            homeId,
            [flag.record_id, flag.canonical_record_id],
        ]
    );

    const duplicate = records.rows.find(
        (row) => row.id === flag.record_id
    );
    const canonical = records.rows.find(
        (row) => row.id === flag.canonical_record_id
    );

    if (duplicate && canonical) {
        await mergeDuplicate({
            kind: flag.record_kind,
            canonical,
            duplicate,
            homeId,
            score: Number(flag.score) || 0.5,
            reasons: [flag.reason || "reviewer confirmed"],
            documentsById,
            client: db,
        });
    }

    await db.query(
        `
        UPDATE record_duplicate_flags
        SET status = 'same',
            updated_at = now()
        WHERE id = $1
        `,
        [flagId]
    );

    return { ...flag, status: "same" };
}
