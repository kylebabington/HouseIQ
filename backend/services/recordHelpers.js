// backend/recordHelpers.js

import pdf from "pdf-parse/lib/pdf-parse.js";

import {
    CHAT_MODEL,
    createEmbedding,
    openai,
    vectorToSql,
} from "./ai/index.js";

import { pool } from "../db/pool.js";

/** Caps shared by /ask and document analysis side effects. */
export const MAX_MEMORIES_PER_RUN = 3;
export const MAX_ISSUES_PER_RUN = 2;
export const MAX_PROJECTS_PER_RUN = 1;
export const MAX_ASSETS_PER_RUN = 2;

const IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

/**
 * Uses OpenAI vision to extract home-relevant text from a photo.
 */
async function extractTextFromImage(file) {
    const base64 = file.buffer.toString("base64");
    const dataUrl =
        `data:${file.mimetype};base64,${base64}`;

    const response =
        await openai.chat.completions.create({
            model: CHAT_MODEL,
            temperature: 0.1,
            messages: [
                {
                    role: "system",
                    content:
                        "You extract all readable text and home-relevant facts from photos of invoices, nameplates, inspection pages, receipts, and equipment labels. Return plain text only. Include brand, model, serial, dates, amounts, and defect notes when visible. If nothing readable is present, say so briefly.",
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text:
                                `Extract all home-relevant text from this uploaded file named "${file.originalname || "photo"}".`,
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: dataUrl,
                            },
                        },
                    ],
                },
            ],
        });

    const text =
        response.choices?.[0]?.message?.content?.trim();

    if (!text) {
        throw new Error(
            "No readable text could be extracted from this image."
        );
    }

    return text;
}

/**
 * Extracts readable text from an uploaded PDF, text file, or image.
 *
 * Supported MIME types:
 *
 * - application/pdf
 * - text/plain
 * - image/jpeg, image/png, image/webp
 */
export async function extractTextFromUploadedFile(file) {
    if (!file) {
        throw new Error("An uploaded file is required");
    }

    if (!file.buffer) {
        throw new Error(
            "The uploaded file does not contain readable file data"
        );
    }

    if (file.mimetype === "text/plain") {
        const text = file.buffer.toString("utf-8").trim();

        if (!text) {
            throw new Error(
                "The uploaded text file is empty"
            );
        }

        return text;
    }

    if (file.mimetype === "application/pdf") {
        const parsedPdf = await pdf(file.buffer);

        const text = parsedPdf.text?.trim();

        if (!text) {
            throw new Error(
                "No readable text could be extracted from this PDF. It may be a scanned image PDF — upload a photo of the page instead."
            );
        }

        return text;
    }

    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
        return extractTextFromImage(file);
    }

    throw new Error(
        `Unsupported file type: ${file.mimetype}`
    );
}

/**
 * Builds the text blob used for memory embeddings.
 */
export function buildMemoryEmbeddingText({
    title,
    category,
    content,
    metadata = {},
}) {
    return `
Title: ${title}
Category: ${category}
Content: ${content}
Metadata: ${JSON.stringify(metadata)}
`;
}

/**
 * Creates an embedding for a memory *before* opening a DB
 * transaction, so OpenAI latency never holds a pool connection.
 */
export async function prepareMemoryEmbedding({
    title,
    category,
    content,
    metadata = {},
}) {
    const embedding = await createEmbedding(
        buildMemoryEmbeddingText({
            title,
            category,
            content,
            metadata,
        })
    );

    return vectorToSql(embedding);
}

/**
 * Normalizes asset type + name for duplicate detection.
 */
export function normalizeAssetKey(assetType, name) {
    return `${String(assetType || "")
        .trim()
        .toLowerCase()}::${String(name || "")
        .trim()
        .toLowerCase()}`;
}

/**
 * Creates a permanent memory and its vector embedding.
 *
 * Prefer passing a precomputed `embeddingSql` (from
 * prepareMemoryEmbedding) when calling inside a transaction so
 * OpenAI work happens outside the txn.
 *
 * The optional `client` argument lets this function participate
 * in a database transaction.
 *
 * If no client is supplied, it uses the normal connection pool.
 */
export async function createMemoryRecord({
    homeId,
    title,
    category,
    content,
    importance = 3,
    assetId = null,
    metadata = {},
    embeddingSql: providedEmbeddingSql = null,
    sourceDocumentId = null,
    sourceAgentRunId = null,
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create a memory");
    }

    if (!content || !content.trim()) {
        throw new Error("Memory content is required");
    }

    const safeTitle =
        title?.trim() || "Untitled memory";

    const safeCategory =
        category?.trim() || "general";

    const safeImportance =
        Number.isInteger(importance)
            ? Math.min(Math.max(importance, 1), 5)
            : 3;

    const embeddingSql =
        providedEmbeddingSql ||
        (await prepareMemoryEmbedding({
            title: safeTitle,
            category: safeCategory,
            content: content.trim(),
            metadata,
        }));

    const result = await client.query(
        `
        INSERT INTO memories (
            home_id,
            asset_id,
            title,
            category,
            content,
            metadata,
            embedding,
            importance,
            source_document_id,
            source_agent_run_id
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::JSONB,
            $7::VECTOR(1536),
            $8,
            $9,
            $10
        )
        RETURNING
            id,
            home_id,
            asset_id,
            title,
            category,
            content,
            metadata,
            importance,
            source_document_id,
            source_agent_run_id,
            created_at,
            updated_at
        `,
        [
            homeId,
            assetId,
            safeTitle,
            safeCategory,
            content.trim(),
            JSON.stringify(metadata),
            embeddingSql,
            safeImportance,
            sourceDocumentId,
            sourceAgentRunId,
        ]
    );

    return result.rows[0];
}


/**
 * Creates an unresolved home issue.
 */
export async function createIssueRecord({
    homeId,
    title,
    description,
    priority = "medium",
    category = "general",
    suspectedCause = "",
    recommendedNextStep = "",
    sourceDocumentId = null,
    sourceAgentRunId = null,
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create an issue");
    }

    if (!title?.trim()) {
        throw new Error("Issue title is required");
    }

    const result = await client.query(
        `
        INSERT INTO home_issues (
            home_id,
            title,
            description,
            status,
            priority,
            category,
            suspected_cause,
            recommended_next_step,
            source_document_id,
            source_agent_run_id
        )
        VALUES (
            $1,
            $2,
            $3,
            'open',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9
        )
        RETURNING *
        `,
        [
            homeId,
            title.trim(),
            description?.trim() || "",
            priority || "medium",
            category || "general",
            suspectedCause?.trim() || "",
            recommendedNextStep?.trim() || "",
            sourceDocumentId,
            sourceAgentRunId,
        ]
    );

    return result.rows[0];
}


/**
 * Creates a project and then creates its individual tasks.
 */
export async function createProjectRecord({
    homeId,
    title,
    description,
    priority = "medium",
    estimatedCostLow = 0,
    estimatedCostHigh = 0,
    diyDifficulty = "unknown",
    safetyNotes = "",
    tasks = [],
    sourceDocumentId = null,
    sourceAgentRunId = null,
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create a project");
    }

    if (!title?.trim()) {
        throw new Error("Project title is required");
    }

    const projectResult = await client.query(
        `
        INSERT INTO home_projects (
            home_id,
            title,
            description,
            status,
            priority,
            estimated_cost_low,
            estimated_cost_high,
            diy_difficulty,
            safety_notes,
            source_document_id,
            source_agent_run_id
        )
        VALUES (
            $1,
            $2,
            $3,
            'planned',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
        )
        RETURNING *
        `,
        [
            homeId,
            title.trim(),
            description?.trim() || "",
            priority || "medium",
            estimatedCostLow ?? 0,
            estimatedCostHigh ?? 0,
            diyDifficulty || "unknown",
            safetyNotes?.trim() || "",
            sourceDocumentId,
            sourceAgentRunId,
        ]
    );

    const project = projectResult.rows[0];

    const createdTasks = [];

    // Create every task in the order supplied by the AI.
    for (let index = 0; index < tasks.length; index += 1) {
        const taskTitle = tasks[index];

        if (
            typeof taskTitle !== "string" ||
            !taskTitle.trim()
        ) {
            continue;
        }

        const taskResult = await client.query(
            `
            INSERT INTO project_tasks (
                project_id,
                title,
                status,
                task_order
            )
            VALUES (
                $1,
                $2,
                'todo',
                $3
            )
            RETURNING *
            `,
            [
                project.id,
                taskTitle.trim(),
                index + 1,
            ]
        );

        createdTasks.push(taskResult.rows[0]);
    }

    return {
        ...project,
        tasks: createdTasks,
    };
}


/**
 * Creates a physical home asset.
 *
 * We intentionally insert only the core fields that are clearly
 * identified by the agent.
 */
export async function createAssetRecord({
    homeId,
    assetType,
    name,
    brand = "",
    model = "",
    serialNumber = "",
    location = "",
    notes = "",
    sourceDocumentId = null,
    sourceAgentRunId = null,
    client = pool,
}) {
    if (!homeId) {
        throw new Error("homeId is required to create an asset");
    }

    if (!assetType?.trim()) {
        throw new Error("Asset type is required");
    }

    if (!name?.trim()) {
        throw new Error("Asset name is required");
    }

    const result = await client.query(
        `
        INSERT INTO home_assets (
            home_id,
            asset_type,
            name,
            brand,
            model,
            serial_number,
            location,
            notes,
            source_document_id,
            source_agent_run_id
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
        )
        RETURNING *
        `,
        [
            homeId,
            assetType.trim(),
            name.trim(),
            brand?.trim() || "",
            model?.trim() || "",
            serialNumber?.trim() || "",
            location?.trim() || "",
            notes?.trim() || "",
            sourceDocumentId,
            sourceAgentRunId,
        ]
    );

    return result.rows[0];
}
