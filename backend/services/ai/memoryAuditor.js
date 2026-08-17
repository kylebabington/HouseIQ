// backend/services/ai/memoryAuditor.js
//
// Read-only HouseIQ Memory Auditor. It inspects CockroachDB
// through Cloud Managed MCP — not the Express pg pool or the
// vector Ask path.

import {
    CHAT_MODEL,
    openai,
} from "./embeddings.js";

import {
    callGuardedMcpTool,
    connectCockroachMcp,
    getMcpConfig,
    listAllowedMcpTools,
} from "../mcp/cockroachMcp.js";

const MAX_TOOL_ROUNDS = 8;
const LLM_RESULT_CHAR_LIMIT = 4000;
const TRACE_PREVIEW_CHAR_LIMIT = 500;

const DEFAULT_AUDITOR_QUESTION =
    "Show me everything HouseIQ currently knows about the HVAC system and where that knowledge came from.";

export { DEFAULT_AUDITOR_QUESTION };

function truncate(value, limit) {
    if (typeof value !== "string") {
        return "";
    }

    if (value.length <= limit) {
        return value;
    }

    return `${value.slice(0, limit)}…`;
}

function summarizeArgs(args) {
    if (!args || typeof args !== "object") {
        return {};
    }

    const copy = { ...args };

    for (const key of ["query", "sql", "statement"]) {
        if (typeof copy[key] === "string") {
            copy[key] = truncate(
                copy[key],
                TRACE_PREVIEW_CHAR_LIMIT
            );
        }
    }

    return copy;
}

function parseToolArguments(raw) {
    if (!raw) {
        return {};
    }

    if (typeof raw === "object") {
        return raw;
    }

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object"
            ? parsed
            : {};
    } catch {
        return {};
    }
}

function mcpToolsToOpenAi(tools) {
    return tools.map((tool) => ({
        type: "function",
        function: {
            name: tool.name,
            description:
                tool.description ||
                `CockroachDB Cloud MCP tool ${tool.name}`,
            parameters:
                tool.inputSchema &&
                typeof tool.inputSchema === "object"
                    ? tool.inputSchema
                    : {
                        type: "object",
                        properties: {},
                    },
        },
    }));
}

function buildAuditorInstructions({
    homeId,
    homeName,
    database,
}) {
    const homeLabel = homeName
        ? `"${homeName}" (${homeId})`
        : homeId;

    return `You are the HouseIQ Memory Auditor.

You inspect what HouseIQ currently believes about one home by querying CockroachDB Cloud through Managed MCP tools. You do not use HouseIQ's Ask/RAG path. You do not create, update, or delete records.

Authorized home: ${homeLabel}
Database name: ${database}

Rules:
- Use only the provided MCP tools.
- Pass database: "${database}" on list_tables, get_table_schema, and select_query.
- Every select_query MUST be a single SELECT that includes home_id = '${homeId}' as a quoted literal (for example WHERE home_id = '${homeId}' or a.home_id = '${homeId}').
- Prefer several small SELECTs with LIMIT 25. Paginate with OFFSET if needed. MCP responses are capped at about 10 KiB.
- Inspect these tables when relevant: home_assets, memories, home_issues, maintenance_events, documents, record_evidence, home_profiles.
- For an HVAC / furnace / air conditioner question, look up matching assets first, then memories, issues, maintenance_events, and provenance (record_evidence joined to documents, plus memories.evidence_passage / evidence_page / source_document_id).
- Cite table name, document file name, page, quote, and match confidence when MCP returned them.
- If MCP returned nothing, say so. Never invent facts, dates, model numbers, or documents.
- Do not call insert_rows, create_table, create_database, or any write tool.

After querying, write a homeowner-readable audit: what HouseIQ knows, and exactly where that knowledge came from.`;
}

/**
 * Runs the Memory Auditor against CockroachDB Cloud MCP.
 */
export async function runMemoryAuditor({
    question,
    homeId,
    homeName = null,
}) {
    const startedAt = Date.now();
    const trimmedQuestion =
        typeof question === "string"
            ? question.trim()
            : "";

    if (!trimmedQuestion) {
        throw new Error("Question is required");
    }

    if (!homeId) {
        throw new Error("homeId is required");
    }

    const config = getMcpConfig();
    const session = await connectCockroachMcp();
    const toolTrace = [];

    try {
        const allowedTools =
            await listAllowedMcpTools(session.client);

        if (allowedTools.length === 0) {
            throw new Error(
                "CockroachDB Cloud MCP did not expose any allowed read tools"
            );
        }

        const openAiTools = mcpToolsToOpenAi(allowedTools);
        const messages = [
            {
                role: "system",
                content: buildAuditorInstructions({
                    homeId,
                    homeName,
                    database: config.database,
                }),
            },
            {
                role: "user",
                content: trimmedQuestion,
            },
        ];

        for (
            let round = 0;
            round < MAX_TOOL_ROUNDS;
            round += 1
        ) {
            const completion =
                await openai.chat.completions.create({
                    model: CHAT_MODEL,
                    temperature: 0.2,
                    messages,
                    tools: openAiTools,
                    tool_choice:
                        round === 0 ? "required" : "auto",
                });

            const message =
                completion.choices[0]?.message;

            if (!message) {
                throw new Error(
                    "Memory Auditor returned an empty model message"
                );
            }

            messages.push(message);

            const toolCalls = message.tool_calls || [];

            if (toolCalls.length === 0) {
                const answer =
                    typeof message.content === "string"
                        ? message.content.trim()
                        : "";

                if (!answer) {
                    throw new Error(
                        "Memory Auditor returned an empty answer"
                    );
                }

                return {
                    answer,
                    toolTrace,
                    model: CHAT_MODEL,
                    durationMs: Date.now() - startedAt,
                };
            }

            for (const toolCall of toolCalls) {
                const toolName =
                    toolCall.function?.name ||
                    toolCall.name;
                const args = parseToolArguments(
                    toolCall.function?.arguments
                );

                let callResult;
                try {
                    callResult = await callGuardedMcpTool({
                        client: session.client,
                        toolName,
                        args,
                        homeId,
                    });
                } catch (error) {
                    callResult = {
                        text:
                            error.message ||
                            "MCP tool call was blocked",
                        isError: true,
                        rowCount: null,
                        elapsedMs: 0,
                    };
                }

                toolTrace.push({
                    tool: toolName,
                    arguments: summarizeArgs(args),
                    rowCount: callResult.rowCount,
                    preview: truncate(
                        callResult.text,
                        TRACE_PREVIEW_CHAR_LIMIT
                    ),
                    elapsedMs: callResult.elapsedMs,
                    isError: callResult.isError,
                });

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: truncate(
                        callResult.isError
                            ? `ERROR: ${callResult.text}`
                            : callResult.text,
                        LLM_RESULT_CHAR_LIMIT
                    ),
                });
            }
        }

        const finalCompletion =
            await openai.chat.completions.create({
                model: CHAT_MODEL,
                temperature: 0.2,
                messages: [
                    ...messages,
                    {
                        role: "user",
                        content:
                            "Stop calling tools. Using only the MCP results already retrieved, write the audit now.",
                    },
                ],
            });

        const answer =
            finalCompletion.choices[0]?.message?.content?.trim() ||
            "";

        if (!answer) {
            throw new Error(
                "Memory Auditor returned an empty answer"
            );
        }

        return {
            answer,
            toolTrace,
            model: CHAT_MODEL,
            durationMs: Date.now() - startedAt,
        };
    } finally {
        await session.close();
    }
}
