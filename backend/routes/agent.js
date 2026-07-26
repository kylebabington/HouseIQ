// backend/routes/agent.js

import {
    Router,
} from "express";

import {
    createEmbedding,
    generateHouseAgentResponse,
    vectorToSql,
} from "../ai.js";

import {
    requireAuth,
} from "../auth.js";

import { pool } from "../db.js";

import {
    requireHomeOwnership,
} from "../ownership.js";

import {
    createAssetRecord,
    createIssueRecord,
    createMemoryRecord,
    createProjectRecord,
} from "../recordHelpers.js";

export function createAgentRouter() {
    const router = Router();

    // ---------------------------------------------------------
    // HOUSEIQ AGENT ENDPOINT
    // ---------------------------------------------------------

    router.post(
        "/homes/:homeId/ask",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            const homeId = req.authorizedHomeId;
            const { question } = req.body;

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
                // 3. RETRIEVE RELEVANT LONG-TERM MEMORIES
                // -------------------------------------------------

                const memoriesResult = await pool.query(
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
                );

                relevantMemories = memoriesResult.rows;


                // -------------------------------------------------
                // 4. ASK THE HOUSEIQ AGENT WHAT TO DO
                // -------------------------------------------------

                agentResponse =
                    await generateHouseAgentResponse(
                        question.trim(),
                        relevantMemories
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
                    const memoryInput of
                    agentResponse.memoriesToCreate
                ) {
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
                    agentResponse.issuesToCreate
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
                    agentResponse.projectsToCreate
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
                    agentResponse.assetsToCreate
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
                    "Error running HouseIQ agent:",
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
