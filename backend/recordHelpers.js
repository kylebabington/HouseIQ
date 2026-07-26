// backend/recordHelpers.js

import pdf from "pdf-parse/lib/pdf-parse.js";

import {
    createEmbedding,
    vectorToSql,
} from "./ai.js";

import { pool } from "./db.js";

// ---------------------------------------------------------
// DATABASE RECORD HELPERS
// ---------------------------------------------------------

// ---------------------------------------------------------
// DOCUMENT TEXT EXTRACTION
// ---------------------------------------------------------

/**
 * Extracts readable text from an uploaded PDF or text file.
 *
 * Supported MIME types:
 *
 * - application/pdf
 * - text/plain
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
                "No readable text could be extracted from this PDF. It may be a scanned image PDF."
            );
        }

        return text;
    }

    throw new Error(
        `Unsupported file type: ${file.mimetype}`
    );
}
/**
 * Creates a permanent memory and its vector embedding.
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

    // Include the title, category, and metadata in the embedded text.
    // This produces better semantic searches than embedding only content.
    const memoryTextForEmbedding = `
Title: ${safeTitle}
Category: ${safeCategory}
Content: ${content.trim()}
Metadata: ${JSON.stringify(metadata)}
`;

    const embedding =
        await createEmbedding(memoryTextForEmbedding);

    const embeddingSql =
        vectorToSql(embedding);

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
            importance
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::JSONB,
            $7::VECTOR(1536),
            $8
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
            recommended_next_step
        )
        VALUES (
            $1,
            $2,
            $3,
            'open',
            $4,
            $5,
            $6,
            $7
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
            safety_notes
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
            $8
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
            notes
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
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
        ]
    );

    return result.rows[0];
}
