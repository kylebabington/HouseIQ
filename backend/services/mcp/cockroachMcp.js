// backend/services/mcp/cockroachMcp.js
//
// Streamable HTTP client for CockroachDB Cloud Managed MCP.
// Auth is a Cloud service-account API key, not DATABASE_URL.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
    ALLOWED_MCP_TOOLS,
    assertToolCallAllowed,
} from "./sqlGuard.js";

export const DEFAULT_MCP_URL =
    "https://cockroachlabs.cloud/mcp";

export function getMcpConfig() {
    return {
        url:
            (process.env.COCKROACH_MCP_URL ||
                DEFAULT_MCP_URL).trim(),
        apiKey:
            (process.env.COCKROACH_MCP_API_KEY ||
                "").trim(),
        clusterId:
            (process.env.COCKROACH_CLUSTER_ID ||
                "").trim(),
        database:
            (process.env.COCKROACH_MCP_DATABASE ||
                "houseiq").trim(),
    };
}

export function isMcpConfigured() {
    const config = getMcpConfig();
    return Boolean(config.apiKey && config.clusterId);
}

const TOOLS_THAT_NEED_DATABASE = new Set([
    "list_tables",
    "get_table_schema",
    "select_query",
    "explain_query",
    "show_statement",
]);

/**
 * Pin every MCP call to the HouseIQ cluster and database so the
 * auditor cannot wander onto another cluster the service account
 * can see.
 */
export function fillMcpToolArgs(toolName, args, config) {
    const next = {
        ...(args && typeof args === "object" ? args : {}),
    };

    // Cluster is pinned by the mcp-cluster-id header. Passing
    // cluster_id again makes Cloud MCP reject the call.
    delete next.cluster_id;

    if (TOOLS_THAT_NEED_DATABASE.has(toolName)) {
        next.database = config?.database || "houseiq";
    }

    return next;
}

function formatToolResultText(result) {
    if (!result) {
        return "(empty MCP result)";
    }

    if (typeof result.structuredContent !== "undefined") {
        try {
            return JSON.stringify(result.structuredContent);
        } catch {
            // Fall through to content parts.
        }
    }

    if (Array.isArray(result.content)) {
        const parts = result.content
            .map((part) => {
                if (part?.type === "text" && part.text) {
                    return part.text;
                }

                try {
                    return JSON.stringify(part);
                } catch {
                    return String(part);
                }
            })
            .filter(Boolean);

        if (parts.length > 0) {
            return parts.join("\n");
        }
    }

    try {
        return JSON.stringify(result);
    } catch {
        return String(result);
    }
}

function inferRowCount(text) {
    if (typeof text !== "string" || !text.trim()) {
        return null;
    }

    try {
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) {
            return parsed.length;
        }

        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.rows)) {
                return parsed.rows.length;
            }

            if (Array.isArray(parsed.result)) {
                return parsed.result.length;
            }
        }
    } catch {
        // Not JSON — count newline-delimited data rows loosely.
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length > 1) {
            return lines.length;
        }
    }

    return null;
}

/**
 * Opens a short-lived MCP session pinned to the HouseIQ cluster.
 */
export async function connectCockroachMcp() {
    if (!isMcpConfigured()) {
        const error = new Error(
            "CockroachDB Cloud MCP is not configured"
        );
        error.code = "MCP_NOT_CONFIGURED";
        throw error;
    }

    const config = getMcpConfig();
    const client = new Client({
        name: "houseiq-memory-auditor",
        version: "1.0.0",
    });

    const transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        {
            requestInit: {
                headers: {
                    Authorization:
                        `Bearer ${config.apiKey}`,
                    "mcp-cluster-id":
                        config.clusterId,
                },
            },
        }
    );

    await client.connect(transport);

    return {
        client,
        database: config.database,
        async close() {
            try {
                await client.close();
            } catch {
                // Session teardown is best-effort.
            }
        },
    };
}

export async function listAllowedMcpTools(client) {
    const listed = await client.listTools();
    const tools = Array.isArray(listed?.tools)
        ? listed.tools
        : [];

    return tools.filter((tool) =>
        ALLOWED_MCP_TOOLS.has(tool.name)
    );
}

export async function callGuardedMcpTool({
    client,
    toolName,
    args,
    homeId,
}) {
    const filledArgs = fillMcpToolArgs(
        toolName,
        args,
        getMcpConfig()
    );

    assertToolCallAllowed({
        toolName,
        args: filledArgs,
        homeId,
    });

    const startedAt = Date.now();
    const result = await client.callTool({
        name: toolName,
        arguments: filledArgs,
    });
    const elapsedMs = Date.now() - startedAt;

    const text = formatToolResultText(result);
    const isError = Boolean(result?.isError);

    return {
        text,
        isError,
        rowCount: inferRowCount(text),
        elapsedMs,
    };
}

export {
    ALLOWED_MCP_TOOLS,
    assertSelectQueryAllowed,
    assertToolCallAllowed,
} from "./sqlGuard.js";
