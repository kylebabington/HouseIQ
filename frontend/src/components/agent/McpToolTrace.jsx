// frontend/src/components/agent/McpToolTrace.jsx

function formatSqlPreview(args) {
  if (!args || typeof args !== "object") {
    return "";
  }

  return (
    args.query ||
    args.sql ||
    args.statement ||
    ""
  );
}

export default function McpToolTrace({ result }) {
  if (!result) {
    return null;
  }

  return (
    <section className="mcp-tool-trace">
      <h4>MCP tool trace</h4>
      <p className="muted">
        {result.via || "cockroachdb-cloud-mcp"}
        {result.model ? ` · ${result.model}` : ""}
        {typeof result.durationMs === "number"
          ? ` · ${result.durationMs}ms`
          : ""}
      </p>

      {Array.isArray(result.toolTrace) &&
      result.toolTrace.length > 0 ? (
        <ol className="mcp-tool-trace-list">
          {result.toolTrace.map((step, index) => {
            const sql = formatSqlPreview(step.arguments);

            return (
              <li key={`${step.tool}-${index}`}>
                <div className="mcp-tool-trace-header">
                  <strong>{step.tool}</strong>
                  {typeof step.rowCount === "number" ? (
                    <span>
                      {step.rowCount} row
                      {step.rowCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {step.isError ? (
                    <span className="mcp-tool-error">
                      blocked / error
                    </span>
                  ) : null}
                </div>
                {sql ? (
                  <pre className="mcp-sql">{sql}</pre>
                ) : null}
                {step.preview ? (
                  <p className="muted">{step.preview}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">
          No MCP tool calls were recorded.
        </p>
      )}
    </section>
  );
}
