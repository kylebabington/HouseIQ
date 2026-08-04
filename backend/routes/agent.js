// backend/routes/agent.js

import {
    Router,
} from "express";

import {
    createEmbedding,
    generateHouseAgentResponse,
    vectorToSql,
} from "../services/ai/index.js";

import {
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireHomeOwnership,
} from "../middleware/ownership.js";

import {
    askRateLimit,
} from "../middleware/rateLimit.js";

import {
    createAssetRecord,
    createIssueRecord,
    createMemoryRecord,
    createProjectRecord,
    MAX_ASSETS_PER_RUN,
    MAX_ISSUES_PER_RUN,
    MAX_MEMORIES_PER_RUN,
    MAX_PROJECTS_PER_RUN,
    normalizeAssetKey,
    prepareMemoryEmbedding,
} from "../services/recordHelpers.js";

import {
    formatHomeProfile,
} from "../lib/homeProfile.js";

import {
    formatLocalSeasonLine,
} from "../lib/climateZones.js";

// Profile fields that are internal bookkeeping rather than
// physical facts about the home, excluded from contextUsed.
const NON_FACT_PROFILE_FIELD_PATTERN =
    /^(homeId|metadata|onboarding|profileCreatedAt|profileUpdatedAt)/i;

// The frontend may send a handful of recent turns so HouseIQ has
// light conversational context. This caps how many are trusted
// regardless of what the client sends.
const MAX_CONVERSATION_HISTORY_ITEMS = 3;

/**
 * Validates and normalizes the optional conversationHistory body
 * field into a small array of { role, content } strings.
 *
 * Anything malformed is dropped rather than rejected outright —
 * conversation history is a nice-to-have, not a correctness
 * requirement for the agent to function.
 */
function sanitizeConversationHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) {
        return [];
    }

    return rawHistory
        .filter(
            (item) =>
                item &&
                typeof item === "object" &&
                (item.role === "user" ||
                    item.role === "assistant") &&
                typeof item.content === "string" &&
                item.content.trim().length > 0
        )
        .slice(0, MAX_CONVERSATION_HISTORY_ITEMS * 2)
        .map((item) => ({
            role: item.role,
            content: item.content.trim().slice(0, 400),
        }));
}

export function createAgentRouter() {
    const router = Router();

    router.get(
        "/homes/:homeId/agent-runs",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;

                const result = await pool.query(
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
                    ORDER BY created_at DESC
                    LIMIT 20
                    `,
                    [homeId]
                );

                return res.json(result.rows);
            } catch (error) {
                console.error(
                    "Error fetching agent runs:",
                    error
                );
                return res.status(500).json({
                    error:
                        "Failed to load advice history",
                });
            }
        }
    );

    // ---------------------------------------------------------
    // HOUSEIQ AGENT ENDPOINT
    // ---------------------------------------------------------

    router.post(
        "/homes/:homeId/ask",
        requireAuth,

        // requireAuth runs first so req.auth.payload.sub is
        // available for askRateLimit to key the limit on the
        // authenticated user rather than only their IP address.
        askRateLimit,

        requireHomeOwnership,
        async (req, res) => {
            const homeId = req.authorizedHomeId;
            const { question, conversationHistory } = req.body;

            const sanitizedConversationHistory =
                sanitizeConversationHistory(
                    conversationHistory
                );

            // Validate before doing any expensive AI work.
            if (
                typeof question !== "string" ||
                !question.trim()
            ) {
                return res.status(400).json({
                    error: "Question is required",
                });
            }

            let client;
            let agentResponse = null;
            let relevantMemories = [];

            try {
                // -------------------------------------------------
                // 1. LOAD THE AUTHORIZED HOME PROFILE
                // -------------------------------------------------
                //
                // Ownership was already verified by
                // requireHomeOwnership. Load the remaining profile
                // fields needed by the agent.
                //
                const homeResult = await pool.query(
                    `
                SELECT id, name, year_built, notes
                FROM homes
                WHERE id = $1
                `,
                    [homeId]
                );

                if (homeResult.rows.length === 0) {
                    return res.status(404).json({
                        error: "Home not found",
                    });
                }

                const home = homeResult.rows[0];


                // -------------------------------------------------
                // 2. CREATE AN EMBEDDING FOR THE USER'S MESSAGE
                // -------------------------------------------------

                const questionEmbedding =
                    await createEmbedding(question.trim());

                const questionVectorSql =
                    vectorToSql(questionEmbedding);


                // -------------------------------------------------
                // 3. LOAD EVERYTHING THE AGENT NEEDS TO KNOW ABOUT
                //    THIS HOME, IN PARALLEL
                // -------------------------------------------------
                //
                // Profile facts, open issues, active projects, and
                // known assets all give the agent grounding so it
                // does not have to guess or invent details, and so
                // it can avoid creating duplicate records.
                //
                const [
                    profileResult,
                    issuesResult,
                    projectsResult,
                    assetsResult,
                    memoriesResult,
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
                    SELECT *
                    FROM home_issues
                    WHERE home_id = $1
                      AND status NOT IN ('resolved', 'closed')
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
                    ORDER BY updated_at DESC
                    LIMIT 8
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
                        metadata,
                        importance,
                        created_at,
                        embedding <=> $2::VECTOR(1536)
                            AS similarity_distance
                    FROM memories
                    WHERE home_id = $1
                      AND embedding IS NOT NULL
                    ORDER BY
                        embedding <=> $2::VECTOR(1536)
                    LIMIT 8
                    `,
                        [
                            homeId,
                            questionVectorSql,
                        ]
                    ),
                ]);

                relevantMemories = memoriesResult.rows;

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

                const localSeasonLine =
                    formatLocalSeasonLine(
                        profile?.postalCode ||
                            profileResult.rows[0]
                                ?.postal_code
                    );


                // -------------------------------------------------
                // 4. ASK THE HOUSEIQ AGENT WHAT TO DO
                // -------------------------------------------------

                agentResponse =
                    await generateHouseAgentResponse(
                        question.trim(),
                        {
                            home: {
                                id: home.id,
                                name: home.name,
                                year_built: home.year_built,
                                notes: home.notes,
                            },
                            profile,
                            localSeasonLine,
                            memories: relevantMemories,
                            issues,
                            projects,
                            assets,
                            conversationHistory:
                                sanitizedConversationHistory,
                        }
                    );


                // -------------------------------------------------
                // 5b. CAP SIDE EFFECTS AND PRE-EMBED MEMORIES
                // -------------------------------------------------
                //
                // Caps and embeddings happen *before* BEGIN so OpenAI
                // latency never holds a transaction connection.
                //
                const memoriesToCreate = (
                    agentResponse.memoriesToCreate || []
                ).slice(0, MAX_MEMORIES_PER_RUN);

                const issuesToCreate = (
                    agentResponse.issuesToCreate || []
                ).slice(0, MAX_ISSUES_PER_RUN);

                const projectsToCreate = (
                    agentResponse.projectsToCreate || []
                ).slice(0, MAX_PROJECTS_PER_RUN);

                let assetsToCreate = (
                    agentResponse.assetsToCreate || []
                ).slice(0, MAX_ASSETS_PER_RUN);

                const existingAssetKeys = new Set(
                    (assets || []).map((row) =>
                        normalizeAssetKey(
                            row.asset_type,
                            row.name
                        )
                    )
                );

                assetsToCreate =
                    assetsToCreate.filter(
                        (assetInput) => {
                            const key =
                                normalizeAssetKey(
                                    assetInput.assetType,
                                    assetInput.name
                                );

                            if (
                                existingAssetKeys.has(
                                    key
                                )
                            ) {
                                return false;
                            }

                            existingAssetKeys.add(
                                key
                            );
                            return true;
                        }
                    );

                const memoryEmbeddings =
                    await Promise.all(
                        memoriesToCreate.map(
                            async (memoryInput) => {
                                const title =
                                    memoryInput.title?.trim() ||
                                    "Untitled memory";
                                const category =
                                    memoryInput.category?.trim() ||
                                    "general";
                                const content =
                                    memoryInput.content?.trim() ||
                                    "";

                                return prepareMemoryEmbedding({
                                    title,
                                    category,
                                    content,
                                    metadata: {
                                        source:
                                            "houseiq_agent",
                                        originalQuestion:
                                            question.trim(),
                                    },
                                });
                            }
                        )
                    );


                // -------------------------------------------------
                // 5. START A DATABASE TRANSACTION
                // -------------------------------------------------
                //
                // A transaction means all database actions succeed
                // together or fail together.
                //
                // Without this, HouseIQ might create a memory and issue,
                // fail while creating a project, and leave the database
                // in a half-completed state.
                //
                client = await pool.connect();

                await client.query("BEGIN");


                // This object contains the actual database records created
                // during this run.
                const createdRecords = {
                    memories: [],
                    issues: [],
                    projects: [],
                    assets: [],
                };


                // This gives the frontend a simple human-readable list.
                const actionsTaken = [];


                // -------------------------------------------------
                // 6. CREATE MEMORIES
                // -------------------------------------------------

                for (
                    let memoryIndex = 0;
                    memoryIndex < memoriesToCreate.length;
                    memoryIndex += 1
                ) {
                    const memoryInput =
                        memoriesToCreate[memoryIndex];

                    const createdMemory =
                        await createMemoryRecord({
                            homeId,

                            title:
                                memoryInput.title,

                            category:
                                memoryInput.category,

                            content:
                                memoryInput.content,

                            importance:
                                memoryInput.importance,

                            metadata: {
                                source: "houseiq_agent",
                                originalQuestion:
                                    question.trim(),
                            },

                            embeddingSql:
                                memoryEmbeddings[
                                    memoryIndex
                                ],

                            client,
                        });

                    createdRecords.memories.push(
                        createdMemory
                    );

                    actionsTaken.push({
                        type: "memory_created",
                        recordId: createdMemory.id,
                        title: createdMemory.title,
                    });
                }


                // -------------------------------------------------
                // 7. CREATE ISSUES
                // -------------------------------------------------

                for (
                    const issueInput of
                    issuesToCreate
                ) {
                    const createdIssue =
                        await createIssueRecord({
                            homeId,

                            title:
                                issueInput.title,

                            description:
                                issueInput.description,

                            priority:
                                issueInput.priority,

                            category:
                                issueInput.category,

                            suspectedCause:
                                issueInput.suspectedCause,

                            recommendedNextStep:
                                issueInput.recommendedNextStep,

                            client,
                        });

                    createdRecords.issues.push(
                        createdIssue
                    );

                    actionsTaken.push({
                        type: "issue_created",
                        recordId: createdIssue.id,
                        title: createdIssue.title,
                    });
                }


                // -------------------------------------------------
                // 8. CREATE PROJECTS AND TASKS
                // -------------------------------------------------

                for (
                    const projectInput of
                    projectsToCreate
                ) {
                    const createdProject =
                        await createProjectRecord({
                            homeId,

                            title:
                                projectInput.title,

                            description:
                                projectInput.description,

                            priority:
                                projectInput.priority,

                            estimatedCostLow:
                                projectInput.estimatedCostLow,

                            estimatedCostHigh:
                                projectInput.estimatedCostHigh,

                            diyDifficulty:
                                projectInput.diyDifficulty,

                            safetyNotes:
                                projectInput.safetyNotes,

                            tasks:
                                projectInput.tasks,

                            client,
                        });

                    createdRecords.projects.push(
                        createdProject
                    );

                    actionsTaken.push({
                        type: "project_created",
                        recordId: createdProject.id,
                        title: createdProject.title,
                        taskCount:
                            createdProject.tasks.length,
                    });
                }


                // -------------------------------------------------
                // 9. CREATE ASSETS
                // -------------------------------------------------

                for (
                    const assetInput of
                    assetsToCreate
                ) {
                    const createdAsset =
                        await createAssetRecord({
                            homeId,

                            assetType:
                                assetInput.assetType,

                            name:
                                assetInput.name,

                            brand:
                                assetInput.brand,

                            model:
                                assetInput.model,

                            serialNumber:
                                assetInput.serialNumber,

                            location:
                                assetInput.location,

                            notes:
                                assetInput.notes,

                            client,
                        });

                    createdRecords.assets.push(
                        createdAsset
                    );

                    actionsTaken.push({
                        type: "asset_created",
                        recordId: createdAsset.id,
                        title: createdAsset.name,
                    });
                }


                // -------------------------------------------------
                // 10. LOG THE COMPLETE AGENT RUN
                // -------------------------------------------------

                const agentRunResult =
                    await client.query(
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
                        actions_taken
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7::JSONB,
                        $8::JSONB,
                        $9::JSONB
                    )
                    RETURNING *
                    `,
                        [
                            homeId,
                            question.trim(),
                            agentResponse.answer,
                            "completed",
                            agentResponse.confidence,
                            agentResponse.needsMoreInfo,

                            JSON.stringify(
                                agentResponse.clarifyingQuestions
                            ),

                            JSON.stringify(
                                relevantMemories.map(
                                    (memory) => memory.id
                                )
                            ),

                            JSON.stringify(actionsTaken),
                        ]
                    );

                const agentRun =
                    agentRunResult.rows[0];


                // -------------------------------------------------
                // 11. COMMIT THE TRANSACTION
                // -------------------------------------------------

                await client.query("COMMIT");


                // -------------------------------------------------
                // 11b. BUILD THE CONTEXT-USED SUMMARY
                // -------------------------------------------------
                //
                // This is computed server-side (never trusted from the
                // model) so the frontend can show the homeowner exactly
                // what HouseIQ actually knew about their home when it
                // answered.
                //
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

                const contextUsed = {
                    profileFields,

                    memoryTitles: relevantMemories
                        .map((memory) => memory.title)
                        .slice(0, 8),

                    issueTitles: issues.map(
                        (issue) => issue.title
                    ),

                    projectTitles: projects.map(
                        (project) => project.title
                    ),

                    assetNames: assets.map(
                        (asset) => asset.name
                    ),

                    counts: {
                        memories: relevantMemories.length,
                        issues: issues.length,
                        projects: projects.length,
                        assets: assets.length,
                        profileFields: profileFields.length,
                    },
                };


                // -------------------------------------------------
                // 12. RETURN EVERYTHING THE FRONTEND NEEDS
                // -------------------------------------------------

                return res.json({
                    question: question.trim(),

                    home: {
                        id: home.id,
                        name: home.name,
                    },

                    answer:
                        agentResponse.answer,

                    confidence:
                        agentResponse.confidence,

                    needsMoreInfo:
                        agentResponse.needsMoreInfo,

                    clarifyingQuestions:
                        agentResponse.clarifyingQuestions,

                    actionsTaken,

                    createdRecords,

                    memoriesUsed:
                        relevantMemories,

                    contextUsed,

                    agentRunId:
                        agentRun.id,
                });
            } catch (error) {
                // If the transaction started, undo all pending writes.
                if (client) {
                    try {
                        await client.query("ROLLBACK");
                    } catch (rollbackError) {
                        console.error(
                            "Failed to roll back transaction:",
                            rollbackError
                        );
                    }
                }

                console.error(
                    `Error running HouseIQ agent [requestId=${req.requestId}]:`,
                    error
                );

                // Log the failed run outside the rolled-back transaction
                // so every interaction still leaves an agent_runs record.
                try {
                    await pool.query(
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
                        actions_taken
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7::JSONB,
                        $8::JSONB,
                        $9::JSONB
                    )
                    `,
                        [
                            homeId,
                            question.trim(),
                            agentResponse?.answer || null,
                            "failed",
                            agentResponse?.confidence || "low",
                            agentResponse?.needsMoreInfo || false,
                            JSON.stringify(
                                agentResponse?.clarifyingQuestions || []
                            ),
                            JSON.stringify(
                                relevantMemories.map(
                                    (memory) => memory.id
                                )
                            ),
                            JSON.stringify([]),
                        ]
                    );
                } catch (logError) {
                    console.error(
                        "Failed to log failed agent run:",
                        logError
                    );
                }

                return res.status(500).json({
                    error: "HouseIQ could not process the request",
                    requestId: req.requestId,
                });
            } finally {
                // Return the database connection to the pool.
                if (client) {
                    client.release();
                }
            }
        });

    return router;
}
