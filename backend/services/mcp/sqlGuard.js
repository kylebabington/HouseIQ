// backend/services/mcp/sqlGuard.js
//
// HouseIQ authorization sitting on top of cluster-wide MCP
// access. Cockroach Cloud MCP can query any database the
// service account can see; the Memory Auditor may only inspect
// the authorized home.

export const READ_ONLY_MCP_TOOLS = new Set([
    "list_clusters",
    "get_cluster",
    "list_databases",
    "list_tables",
    "get_table_schema",
    "select_query",
    "explain_query",
    "show_statement",
    "show_running_queries",
]);

// The Auditor is allowed to inspect schema and run SELECTs.
// Write tools stay blocked even if the service account has them.
export const ALLOWED_MCP_TOOLS = new Set([
    "list_databases",
    "list_tables",
    "get_table_schema",
    "select_query",
    "show_statement",
]);

const WRITE_SQL_PATTERN =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|IMPORT|EXPORT|BACKUP|RESTORE)\b/i;

const SET_OPERATION_PATTERN =
    /\b(UNION|EXCEPT|INTERSECT)\b/i;

function escapeRegex(value) {
    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

function extractSqlFromArgs(args) {
    if (!args || typeof args !== "object") {
        return "";
    }

    if (typeof args.query === "string") {
        return args.query;
    }

    if (typeof args.sql === "string") {
        return args.sql;
    }

    if (typeof args.statement === "string") {
        return args.statement;
    }

    return "";
}

/**
 * Remove -- line comments and /* block comments so a home_id
 * filter cannot be hidden or a second statement smuggled in.
 */
export function stripSqlComments(sql) {
    let withoutBlocks = String(sql).replace(
        /\/\*[\s\S]*?\*\//g,
        " "
    );

    const withoutLineComments = withoutBlocks
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n");

    return withoutLineComments.replace(/\s+/g, " ").trim();
}

function countSelectKeywords(sql) {
    const matches = sql.match(/\bSELECT\b/gi);
    return matches ? matches.length : 0;
}

/**
 * Throws if the MCP tool call is not a read-only, home-scoped
 * inspection of HouseIQ memory.
 */
export function assertToolCallAllowed({
    toolName,
    args,
    homeId,
}) {
    if (!ALLOWED_MCP_TOOLS.has(toolName)) {
        throw new Error(
            `MCP tool "${toolName}" is not allowed for the Memory Auditor`
        );
    }

    if (toolName !== "select_query") {
        return;
    }

    assertSelectQueryAllowed(
        extractSqlFromArgs(args),
        homeId
    );
}

/**
 * SELECT must be a single statement scoped to the authorized
 * home. Schema-inspect tools skip this check.
 */
export function assertSelectQueryAllowed(sql, homeId) {
    if (typeof sql !== "string" || !sql.trim()) {
        throw new Error(
            "select_query requires a SQL string"
        );
    }

    const stripped = stripSqlComments(sql).replace(
        /;\s*$/,
        ""
    );

    if (!stripped) {
        throw new Error(
            "select_query requires a SQL string"
        );
    }

    if (stripped.includes(";")) {
        throw new Error(
            "Multiple SQL statements are not allowed"
        );
    }

    if (/^\s*WITH\b/i.test(stripped)) {
        throw new Error(
            "CTE / WITH queries are not allowed"
        );
    }

    if (SET_OPERATION_PATTERN.test(stripped)) {
        throw new Error(
            "UNION / EXCEPT / INTERSECT are not allowed"
        );
    }

    if (!/^\s*SELECT\b/i.test(stripped)) {
        throw new Error(
            "Only SELECT statements are allowed"
        );
    }

    if (countSelectKeywords(stripped) !== 1) {
        throw new Error(
            "Subqueries and extra SELECT clauses are not allowed"
        );
    }

    if (WRITE_SQL_PATTERN.test(stripped)) {
        throw new Error(
            "Write SQL is not allowed through MCP"
        );
    }

    if (typeof homeId !== "string" || !homeId.trim()) {
        throw new Error(
            "SELECT must be scoped to the authorized home"
        );
    }

    const scoped = new RegExp(
        `home_id\\s*=\\s*'${escapeRegex(homeId.trim())}'`,
        "i"
    );

    if (!scoped.test(stripped)) {
        throw new Error(
            "SELECT must filter on the authorized home_id"
        );
    }
}
