// backend/services/ai/runReadOnlyAsk.js
//
// Vector Ask without creating memories, issues, projects, or
// assets. Used by the public judge demo so anonymous clicks
// cannot densify HouseIQ memory.

import { pool } from "../../db/pool.js";

import {
    CHAT_MODEL,
    createEmbedding,
    generateHouseAgentResponse,
    vectorToSql,
} from "./index.js";

import {
    formatHomeProfile,
} from "../../lib/homeProfile.js";

import {
    formatLocalSeasonLine,
} from "../../lib/climateZones.js";

import {
    formatDocumentChunkCitation,
    searchRelevantDocumentChunks,
} from "../documentChunks.js";

import {
    buildAskToolTrace,
    snapshotMemoriesUsed,
} from "../../lib/askTrace.js";

const NON_FACT_PROFILE_FIELD_PATTERN =
    /^(homeId|metadata|onboarding|profileCreatedAt|profileUpdatedAt)/i;

const MAX_MEMORY_DISTANCE = 0.45;

export async function runReadOnlyAsk({
    homeId,
    question,
}) {
    const startedAt = Date.now();
    const trimmedQuestion = String(question || "").trim();

    if (!trimmedQuestion) {
        throw new Error("Question is required");
    }

    if (!homeId) {
        throw new Error("homeId is required");
    }

    const homeResult = await pool.query(
        `
        SELECT id, name, year_built, notes
        FROM homes
        WHERE id = $1
        `,
        [homeId]
    );

    if (homeResult.rows.length === 0) {
        const error = new Error("Home not found");
        error.code = "HOME_NOT_FOUND";
        throw error;
    }

    const home = homeResult.rows[0];
    const questionEmbedding =
        await createEmbedding(trimmedQuestion);
    const questionVectorSql = vectorToSql(questionEmbedding);

    const [
        profileResult,
        issuesResult,
        projectsResult,
        assetsResult,
        memoriesResult,
        relevantChunks,
    ] = await Promise.all([
        pool.query(
            `SELECT * FROM home_profiles WHERE home_id = $1 LIMIT 1`,
            [homeId]
        ),
        pool.query(
            `
            SELECT *
            FROM home_issues
            WHERE home_id = $1
              AND status NOT IN ('resolved', 'closed')
              AND COALESCE(verification_status, 'accepted') = 'accepted'
              AND merged_into_id IS NULL
            ORDER BY updated_at DESC
            LIMIT 5
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT *
            FROM home_projects
            WHERE home_id = $1
              AND status NOT IN ('completed', 'cancelled')
              AND COALESCE(verification_status, 'accepted') = 'accepted'
              AND merged_into_id IS NULL
            ORDER BY updated_at DESC
            LIMIT 3
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT *
            FROM home_assets
            WHERE home_id = $1
              AND COALESCE(verification_status, 'accepted') = 'accepted'
              AND merged_into_id IS NULL
            ORDER BY updated_at DESC
            LIMIT 8
            `,
            [homeId]
        ),
        pool.query(
            `
            SELECT
                memories.id,
                memories.title,
                memories.category,
                memories.content,
                memories.metadata,
                memories.importance,
                memories.created_at,
                memories.evidence_passage,
                memories.evidence_page,
                memories.source_document_id,
                documents.file_name AS source_file_name,
                documents.document_type AS source_document_type,
                documents.metadata->>'documentDate'
                    AS source_document_date,
                memories.embedding <=> $2::VECTOR(1536)
                    AS similarity_distance
            FROM memories
            LEFT JOIN documents
                ON documents.id = memories.source_document_id
            WHERE memories.home_id = $1
              AND memories.embedding IS NOT NULL
              AND COALESCE(memories.verification_status, 'accepted') = 'accepted'
              AND memories.merged_into_id IS NULL
            ORDER BY memories.embedding <=> $2::VECTOR(1536)
            LIMIT 8
            `,
            [homeId, questionVectorSql]
        ),
        searchRelevantDocumentChunks({
            homeId,
            questionVectorSql,
        }),
    ]);

    const relevantMemories = memoriesResult.rows.filter(
        (row) => {
            if (
                row.similarity_distance === null ||
                row.similarity_distance === undefined
            ) {
                return true;
            }

            const distance = Number(row.similarity_distance);
            return (
                Number.isFinite(distance) &&
                distance <= MAX_MEMORY_DISTANCE
            );
        }
    );

    const issues = issuesResult.rows;
    const projects = projectsResult.rows;
    const assets = assetsResult.rows;
    const profile =
        profileResult.rows.length > 0
            ? formatHomeProfile({
                ...profileResult.rows[0],
                home_id: home.id,
                home_name: home.name,
                year_built: home.year_built,
            })
            : null;

    const agentResponse = await generateHouseAgentResponse(
        trimmedQuestion,
        {
            home: {
                id: home.id,
                name: home.name,
                year_built: home.year_built,
                notes: home.notes,
            },
            profile,
            localSeasonLine: formatLocalSeasonLine({
                postalCode:
                    profile?.postalCode ||
                    profileResult.rows[0]?.postal_code,
                state:
                    profile?.state ||
                    profileResult.rows[0]?.state,
            }),
            memories: relevantMemories,
            documentChunks: relevantChunks,
            issues,
            projects,
            assets,
            conversationHistory: [],
        }
    );

    const toolTrace = buildAskToolTrace({
        memoriesSearched: memoriesResult.rows.length,
        relevantMemories,
        profileLoaded: Boolean(profile),
        assetCount: assets.length,
        issueCount: issues.length,
        projectCount: projects.length,
        actionsTaken: [],
        memoriesProposed: 0,
        model: CHAT_MODEL,
        durationMs: Date.now() - startedAt,
        status: "completed",
    });

    const memoriesUsedSnapshot =
        snapshotMemoriesUsed(relevantMemories);

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
            homeId,
            trimmedQuestion,
            agentResponse.answer,
            "completed",
            agentResponse.confidence,
            agentResponse.needsMoreInfo || false,
            JSON.stringify(
                agentResponse.clarifyingQuestions || []
            ),
            JSON.stringify(memoriesUsedSnapshot),
            JSON.stringify([]),
            "ask",
            JSON.stringify(toolTrace),
        ]
    );

    const profileFields = profile
        ? Object.entries(profile)
            .filter(
                ([fieldName, value]) =>
                    !NON_FACT_PROFILE_FIELD_PATTERN.test(
                        fieldName
                    ) &&
                    value !== null &&
                    value !== undefined &&
                    value !== ""
            )
            .map(([fieldName]) => fieldName)
        : [];

    const recordCitations = [
        ...relevantMemories,
        ...issues,
    ]
        .filter(
            (row) =>
                row.evidence_passage || row.evidencePassage
        )
        .map((row) => ({
            id: row.id,
            title: row.title,
            passage:
                row.evidence_passage || row.evidencePassage,
            page:
                row.evidence_page || row.evidencePage || null,
            sourceDocumentId:
                row.source_document_id || null,
        }));

    return {
        question: trimmedQuestion,
        home: { id: home.id, name: home.name },
        answer: agentResponse.answer,
        confidence: agentResponse.confidence,
        needsMoreInfo: agentResponse.needsMoreInfo,
        clarifyingQuestions:
            agentResponse.clarifyingQuestions || [],
        actionsTaken: [],
        createdRecords: {
            memories: [],
            issues: [],
            projects: [],
            assets: [],
        },
        memoriesUsed: memoriesUsedSnapshot,
        documentsUsed: relevantChunks,
        citations: [
            ...relevantChunks.map(formatDocumentChunkCitation),
            ...recordCitations,
        ].slice(0, 5),
        contextUsed: {
            profileFields,
            memoryTitles: relevantMemories
                .map((memory) => memory.title)
                .slice(0, 8),
            issueTitles: issues.map((issue) => issue.title),
            projectTitles: projects.map(
                (project) => project.title
            ),
            assetNames: assets.map((asset) => asset.name),
            counts: {
                memories: relevantMemories.length,
                documentChunks: relevantChunks.length,
                issues: issues.length,
                projects: projects.length,
                assets: assets.length,
                profileFields: profileFields.length,
            },
        },
        toolTrace,
        model: CHAT_MODEL,
        durationMs: toolTrace.durationMs,
        agentRunId: agentRunResult.rows[0]?.id,
        via: "cockroachdb-vector",
        readOnly: true,
    };
}
