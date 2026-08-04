// backend/routes/records.js
//
// ---------------------------------------------------------
// RECORD ACT LOOP (PATCH / DELETE)
// ---------------------------------------------------------
//
// These routes let a human review and correct records the
// AI agent created: issues, projects, project tasks,
// assets, and memories.
//
// Every route requires:
//
// 1. requireAuth              - a valid Auth0 access token
// 2. requireHomeOwnership     - the home belongs to the caller
//
// requireHomeOwnership sets req.authorizedHomeId, and every
// UPDATE / DELETE below re-checks that the target record
// belongs to that home. This prevents one owner from editing
// another owner's record by guessing an ID, even if they own
// some other home.

import {
    Router,
} from "express";

import {
    requireAuth,
} from "../middleware/auth.js";

import { pool } from "../db/pool.js";

import {
    requireHomeOwnership,
} from "../middleware/ownership.js";

import {
    isValidUuid,
} from "../lib/validation.js";

import {
    prepareMemoryEmbedding,
} from "../services/recordHelpers.js";

// ---------------------------------------------------------
// FIELD ALLOWLISTS
// ---------------------------------------------------------
//
// Maps camelCase API field names to snake_case database
// columns. Only fields listed here can ever be written by a
// client request, and column names are never taken directly
// from request text.

const ISSUE_FIELDS = {
    title: "title",
    description: "description",
    status: "status",
    priority: "priority",
    recommendedNextStep: "recommended_next_step",
};

const PROJECT_FIELDS = {
    status: "status",
    priority: "priority",
};

const TASK_FIELDS = {
    status: "status",
};

const ASSET_FIELDS = {
    name: "name",
    brand: "brand",
    model: "model",
    location: "location",
    notes: "notes",
};

const MEMORY_FIELDS = {
    title: "title",
    content: "content",
    importance: "importance",
    category: "category",
};

// ---------------------------------------------------------
// VALID ENUM VALUES
// ---------------------------------------------------------

const ISSUE_STATUSES = new Set([
    "open",
    "in_progress",
    "resolved",
    "closed",
]);

const ISSUE_PRIORITIES = new Set([
    "low",
    "medium",
    "high",
    "urgent",
]);

const PROJECT_STATUSES = new Set([
    "planned",
    "in_progress",
    "completed",
    "cancelled",
]);

const PROJECT_PRIORITIES = ISSUE_PRIORITIES;

const TASK_STATUSES = new Set([
    "todo",
    "done",
    "blocked",
]);

// ---------------------------------------------------------
// FIELD VALIDATORS
// ---------------------------------------------------------
//
// Each validator receives the raw request value and returns
// either { valid: true, value } or { valid: false, error }.

function validateEnumField(allowedValues, errorMessage) {
    return (rawValue) => {
        if (
            typeof rawValue !== "string" ||
            !allowedValues.has(rawValue)
        ) {
            return {
                valid: false,
                error: errorMessage,
            };
        }

        return {
            valid: true,
            value: rawValue,
        };
    };
}

function validateRequiredString(fieldLabel, maxLength) {
    return (rawValue) => {
        if (
            typeof rawValue !== "string" ||
            !rawValue.trim()
        ) {
            return {
                valid: false,
                error: `${fieldLabel} cannot be empty`,
            };
        }

        const value = rawValue.trim();

        if (value.length > maxLength) {
            return {
                valid: false,
                error: `${fieldLabel} must be ${maxLength} characters or fewer`,
            };
        }

        return {
            valid: true,
            value,
        };
    };
}

// Allows null to clear an optional column.
function validateOptionalString(fieldLabel, maxLength) {
    return (rawValue) => {
        if (rawValue === null) {
            return {
                valid: true,
                value: null,
            };
        }

        if (typeof rawValue !== "string") {
            return {
                valid: false,
                error: `${fieldLabel} must be a string or null`,
            };
        }

        const value = rawValue.trim();

        if (value.length > maxLength) {
            return {
                valid: false,
                error: `${fieldLabel} must be ${maxLength} characters or fewer`,
            };
        }

        return {
            valid: true,
            value: value || null,
        };
    };
}

function validateImportance(rawValue) {
    const value = Number(rawValue);

    if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 5
    ) {
        return {
            valid: false,
            error:
                "importance must be a whole number from 1 to 5",
        };
    }

    return {
        valid: true,
        value,
    };
}

const ISSUE_VALIDATORS = {
    title: validateRequiredString("title", 200),
    description: validateRequiredString(
        "description",
        5000
    ),
    status: validateEnumField(
        ISSUE_STATUSES,
        "status must be one of: open, in_progress, resolved, closed"
    ),
    priority: validateEnumField(
        ISSUE_PRIORITIES,
        "priority must be one of: low, medium, high, urgent"
    ),
    recommendedNextStep: validateOptionalString(
        "recommendedNextStep",
        2000
    ),
};

const PROJECT_VALIDATORS = {
    status: validateEnumField(
        PROJECT_STATUSES,
        "status must be one of: planned, in_progress, completed, cancelled"
    ),
    priority: validateEnumField(
        PROJECT_PRIORITIES,
        "priority must be one of: low, medium, high, urgent"
    ),
};

const TASK_VALIDATORS = {
    status: validateEnumField(
        TASK_STATUSES,
        "status must be one of: todo, done, blocked"
    ),
};

const ASSET_VALIDATORS = {
    name: validateRequiredString("name", 200),
    brand: validateOptionalString("brand", 200),
    model: validateOptionalString("model", 200),
    location: validateOptionalString("location", 200),
    notes: validateOptionalString("notes", 5000),
};

const MEMORY_VALIDATORS = {
    title: validateRequiredString("title", 200),
    content: validateRequiredString("content", 5000),
    importance: validateImportance,
    category: validateRequiredString("category", 100),
};

// ---------------------------------------------------------
// ALLOWLIST UPDATE BUILDER
// ---------------------------------------------------------
//
// Walks every key in the request body, rejects unknown
// fields, validates known fields, and returns the columns
// that are safe to write.

function buildAllowlistUpdate(
    requestBody,
    fieldsAllowlist,
    validators
) {
    const updates = [];
    const errors = {};

    for (const [
        fieldName,
        rawValue,
    ] of Object.entries(requestBody)) {
        const column =
            fieldsAllowlist[fieldName];

        if (!column) {
            errors[fieldName] =
                "This field cannot be updated";
            continue;
        }

        const validate = validators[fieldName];
        const result = validate(rawValue);

        if (!result.valid) {
            errors[fieldName] = result.error;
            continue;
        }

        updates.push({
            column,
            value: result.value,
        });
    }

    return { updates, errors };
}

// Validates the request body shape before we look at fields.
function validateRequestBody(requestBody) {
    if (
        !requestBody ||
        typeof requestBody !== "object" ||
        Array.isArray(requestBody)
    ) {
        return "An update object is required";
    }

    if (Object.keys(requestBody).length === 0) {
        return "At least one field is required";
    }

    return null;
}

export function createRecordsRouter() {
    const router = Router();

    // -------------------------------------------------------
    // PATCH HOME ISSUE
    // -------------------------------------------------------
    router.patch(
        "/homes/:homeId/issues/:issueId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { issueId } = req.params;

                if (!isValidUuid(issueId)) {
                    return res.status(400).json({
                        error: "A valid issue ID is required",
                    });
                }

                const bodyError = validateRequestBody(
                    req.body
                );

                if (bodyError) {
                    return res.status(400).json({
                        error: bodyError,
                    });
                }

                const { updates, errors } =
                    buildAllowlistUpdate(
                        req.body,
                        ISSUE_FIELDS,
                        ISSUE_VALIDATORS
                    );

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        error: "Issue validation failed",
                        fields: errors,
                    });
                }

                const setClauses = updates.map(
                    (update, index) =>
                        `${update.column} = $${index + 3}`
                );

                const values = updates.map(
                    (update) => update.value
                );

                const result = await pool.query(
                    `
                    UPDATE home_issues
                    SET ${setClauses.join(", ")}, updated_at = now()
                    WHERE id = $1
                      AND home_id = $2
                    RETURNING *
                    `,
                    [issueId, homeId, ...values]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Issue not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error updating issue:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to update issue",
                });
            }
        }
    );

    // -------------------------------------------------------
    // PATCH HOME PROJECT
    // -------------------------------------------------------
    router.patch(
        "/homes/:homeId/projects/:projectId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { projectId } = req.params;

                if (!isValidUuid(projectId)) {
                    return res.status(400).json({
                        error: "A valid project ID is required",
                    });
                }

                const bodyError = validateRequestBody(
                    req.body
                );

                if (bodyError) {
                    return res.status(400).json({
                        error: bodyError,
                    });
                }

                const { updates, errors } =
                    buildAllowlistUpdate(
                        req.body,
                        PROJECT_FIELDS,
                        PROJECT_VALIDATORS
                    );

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        error: "Project validation failed",
                        fields: errors,
                    });
                }

                const setClauses = updates.map(
                    (update, index) =>
                        `${update.column} = $${index + 3}`
                );

                const values = updates.map(
                    (update) => update.value
                );

                const result = await pool.query(
                    `
                    UPDATE home_projects
                    SET ${setClauses.join(", ")}, updated_at = now()
                    WHERE id = $1
                      AND home_id = $2
                    RETURNING *
                    `,
                    [projectId, homeId, ...values]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Project not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error updating project:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to update project",
                });
            }
        }
    );

    // -------------------------------------------------------
    // PATCH PROJECT TASK
    // -------------------------------------------------------
    //
    // project_tasks does not store home_id directly, so
    // ownership is verified through home_projects with an
    // EXISTS subquery instead of a simple WHERE home_id = $.
    router.patch(
        "/homes/:homeId/projects/:projectId/tasks/:taskId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { projectId, taskId } = req.params;

                if (
                    !isValidUuid(projectId) ||
                    !isValidUuid(taskId)
                ) {
                    return res.status(400).json({
                        error:
                            "A valid project ID and task ID are required",
                    });
                }

                const bodyError = validateRequestBody(
                    req.body
                );

                if (bodyError) {
                    return res.status(400).json({
                        error: bodyError,
                    });
                }

                const { updates, errors } =
                    buildAllowlistUpdate(
                        req.body,
                        TASK_FIELDS,
                        TASK_VALIDATORS
                    );

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        error: "Task validation failed",
                        fields: errors,
                    });
                }

                const setClauses = updates.map(
                    (update, index) =>
                        `${update.column} = $${index + 4}`
                );

                const values = updates.map(
                    (update) => update.value
                );

                const result = await pool.query(
                    `
                    UPDATE project_tasks
                    SET ${setClauses.join(", ")}, updated_at = now()
                    WHERE id = $1
                      AND project_id = $2
                      AND EXISTS (
                        SELECT 1
                        FROM home_projects
                        WHERE home_projects.id = project_tasks.project_id
                          AND home_projects.home_id = $3
                      )
                    RETURNING *
                    `,
                    [taskId, projectId, homeId, ...values]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Task not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error updating task:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to update task",
                });
            }
        }
    );

    // -------------------------------------------------------
    // PATCH HOME ASSET
    // -------------------------------------------------------
    router.patch(
        "/homes/:homeId/assets/:assetId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { assetId } = req.params;

                if (!isValidUuid(assetId)) {
                    return res.status(400).json({
                        error: "A valid asset ID is required",
                    });
                }

                const bodyError = validateRequestBody(
                    req.body
                );

                if (bodyError) {
                    return res.status(400).json({
                        error: bodyError,
                    });
                }

                const { updates, errors } =
                    buildAllowlistUpdate(
                        req.body,
                        ASSET_FIELDS,
                        ASSET_VALIDATORS
                    );

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        error: "Asset validation failed",
                        fields: errors,
                    });
                }

                const setClauses = updates.map(
                    (update, index) =>
                        `${update.column} = $${index + 3}`
                );

                const values = updates.map(
                    (update) => update.value
                );

                const result = await pool.query(
                    `
                    UPDATE home_assets
                    SET ${setClauses.join(", ")}, updated_at = now()
                    WHERE id = $1
                      AND home_id = $2
                    RETURNING *
                    `,
                    [assetId, homeId, ...values]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Asset not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error updating asset:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to update asset",
                });
            }
        }
    );

    // -------------------------------------------------------
    // PATCH MEMORY
    // -------------------------------------------------------
    router.patch(
        "/homes/:homeId/memories/:memoryId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { memoryId } = req.params;

                if (!isValidUuid(memoryId)) {
                    return res.status(400).json({
                        error: "A valid memory ID is required",
                    });
                }

                const bodyError = validateRequestBody(
                    req.body
                );

                if (bodyError) {
                    return res.status(400).json({
                        error: bodyError,
                    });
                }

                const { updates, errors } =
                    buildAllowlistUpdate(
                        req.body,
                        MEMORY_FIELDS,
                        MEMORY_VALIDATORS
                    );

                if (Object.keys(errors).length > 0) {
                    return res.status(400).json({
                        error: "Memory validation failed",
                        fields: errors,
                    });
                }

                const titleOrContentChanged =
                    updates.some(
                        (update) =>
                            update.column === "title" ||
                            update.column === "content"
                    );

                if (titleOrContentChanged) {
                    const currentResult =
                        await pool.query(
                            `
                            SELECT title, category, content, metadata
                            FROM memories
                            WHERE id = $1
                              AND home_id = $2
                            LIMIT 1
                            `,
                            [memoryId, homeId]
                        );

                    if (currentResult.rows.length === 0) {
                        return res.status(404).json({
                            error: "Memory not found",
                        });
                    }

                    const current =
                        currentResult.rows[0];

                    const nextTitle =
                        updates.find(
                            (u) => u.column === "title"
                        )?.value ?? current.title;

                    const nextContent =
                        updates.find(
                            (u) => u.column === "content"
                        )?.value ?? current.content;

                    const nextCategory =
                        updates.find(
                            (u) => u.column === "category"
                        )?.value ?? current.category;

                    const embeddingSql =
                        await prepareMemoryEmbedding({
                            title: nextTitle,
                            category: nextCategory,
                            content: nextContent,
                            metadata:
                                current.metadata || {},
                        });

                    updates.push({
                        column: "embedding",
                        value: embeddingSql,
                    });
                }

                const setClauses = updates.map(
                    (update, index) => {
                        if (
                            update.column === "embedding"
                        ) {
                            return `${update.column} = $${index + 3}::VECTOR(1536)`;
                        }

                        return `${update.column} = $${index + 3}`;
                    }
                );

                const values = updates.map(
                    (update) => update.value
                );

                const result = await pool.query(
                    `
                    UPDATE memories
                    SET ${setClauses.join(", ")}, updated_at = now()
                    WHERE id = $1
                      AND home_id = $2
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
                    [memoryId, homeId, ...values]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Memory not found",
                    });
                }

                return res.json(result.rows[0]);
            } catch (error) {
                console.error(
                    "Error updating memory:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to update memory",
                });
            }
        }
    );

    // -------------------------------------------------------
    // DELETE MEMORY
    // -------------------------------------------------------
    router.delete(
        "/homes/:homeId/memories/:memoryId",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const homeId = req.authorizedHomeId;
                const { memoryId } = req.params;

                if (!isValidUuid(memoryId)) {
                    return res.status(400).json({
                        error: "A valid memory ID is required",
                    });
                }

                const result = await pool.query(
                    `
                    DELETE FROM memories
                    WHERE id = $1
                      AND home_id = $2
                    RETURNING id
                    `,
                    [memoryId, homeId]
                );

                if (result.rows.length === 0) {
                    return res.status(404).json({
                        error: "Memory not found",
                    });
                }

                return res.json({
                    success: true,
                    id: memoryId,
                });
            } catch (error) {
                console.error(
                    "Error deleting memory:",
                    error
                );

                return res.status(500).json({
                    error: "Failed to delete memory",
                });
            }
        }
    );

    return router;
}
