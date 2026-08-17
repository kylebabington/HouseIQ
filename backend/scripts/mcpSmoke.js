// backend/scripts/mcpSmoke.js
//
// Live check that HouseIQ can inspect CockroachDB Cloud through
// Managed MCP. Does not print secrets.

import "dotenv/config";

import {
    callGuardedMcpTool,
    connectCockroachMcp,
    getMcpConfig,
    isMcpConfigured,
    listAllowedMcpTools,
} from "../services/mcp/cockroachMcp.js";

function fail(message) {
    console.error(`MCP smoke failed: ${message}`);
    process.exit(1);
}

const homeId = (process.env.PUBLIC_DEMO_HOME_ID || "").trim();

if (!isMcpConfigured()) {
    fail(
        "Set COCKROACH_MCP_API_KEY and COCKROACH_CLUSTER_ID in backend/.env"
    );
}

if (!homeId) {
    fail("Set PUBLIC_DEMO_HOME_ID so the SELECT can be home-scoped");
}

const config = getMcpConfig();
const session = await connectCockroachMcp();

try {
    const tools = await listAllowedMcpTools(session.client);
    const toolNames = tools.map((tool) => tool.name);

    console.log(`MCP URL: ${config.url}`);
    console.log(`Cluster pinned: ${Boolean(config.clusterId)}`);
    console.log(`Database: ${config.database}`);
    console.log(`Allowed tools: ${toolNames.join(", ") || "(none)"}`);

    if (!toolNames.includes("select_query")) {
        fail("select_query is not exposed by Cockroach Cloud MCP");
    }

    const databases = await callGuardedMcpTool({
        client: session.client,
        toolName: "list_databases",
        args: {},
        homeId,
    });

    if (databases.isError) {
        fail(databases.text);
    }

    console.log(
        `list_databases: ${databases.elapsedMs}ms · ${databases.rowCount ?? "?"} rows`
    );

    const query = await callGuardedMcpTool({
        client: session.client,
        toolName: "select_query",
        args: {
            query:
                `SELECT id, name, asset_type FROM home_assets WHERE home_id = '${homeId}' LIMIT 5`,
        },
        homeId,
    });

    if (query.isError) {
        fail(query.text);
    }

    console.log(
        `select_query: ${query.elapsedMs}ms · ${query.rowCount ?? "?"} rows`
    );
    console.log("CockroachDB Cloud Managed MCP is reachable.");
} finally {
    await session.close();
}
