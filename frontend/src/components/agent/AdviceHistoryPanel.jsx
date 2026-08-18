// frontend/src/components/agent/AdviceHistoryPanel.jsx

import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import {
  countLabel,
  formatLabel,
  formatSimilarity,
  memorySourceLabel,
} from "../../utils/formatters.js";

function isAskTrace(trace) {
  return (
    trace &&
    typeof trace === "object" &&
    !Array.isArray(trace) &&
    Array.isArray(trace.pipeline)
  );
}

function memoriesFromRun(run) {
  if (Array.isArray(run.memories_used) && run.memories_used.length > 0) {
    if (typeof run.memories_used[0] === "object") {
      return run.memories_used;
    }
  }

  if (isAskTrace(run.tool_trace)) {
    const retrieve = run.tool_trace.pipeline.find(
      (step) => step.step === "retrieve"
    );
    return retrieve?.memories || [];
  }

  return [];
}

function RunPipeline({ trace }) {
  if (!isAskTrace(trace)) {
    return null;
  }

  return (
    <ol className="run-pipeline">
      {trace.pipeline.map((step) => (
        <li key={step.step}>{step.label}</li>
      ))}
    </ol>
  );
}

function McpTrace({ trace }) {
  if (!Array.isArray(trace) || trace.length === 0) {
    return null;
  }

  return (
    <ol className="mcp-tool-trace-list">
      {trace.map((step, index) => (
        <li key={`${step.tool}-${index}`}>
          <strong>{step.tool}</strong>
          {typeof step.rowCount === "number" ? (
            <span>
              {" "}
              · {step.rowCount} row
              {step.rowCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {step.arguments?.query ? (
            <pre className="mcp-sql">{step.arguments.query}</pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function AdviceHistoryPanel({
  runs,
  isLoading,
  error,
}) {
  const count = runs?.length || 0;

  return (
    <CollapsibleSection
      title="Agent Run Inspector"
      summary={
        count
          ? countLabel(count, "run")
          : "No runs yet"
      }
    >
      <div className="agent-run-inspector">
        {isLoading ? (
          <p className="muted">Loading…</p>
        ) : error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : count === 0 ? (
          <p>
            Ask and Memory Auditor runs will appear here with
            the embeddings, retrieved memories, tools, and
            proposed actions from each turn.
          </p>
        ) : (
          <ul className="advice-history-list">
            {runs.map((run) => {
              const kind = run.run_kind || "ask";
              const trace = run.tool_trace;
              const memories = memoriesFromRun(run);
              const durationMs = isAskTrace(trace)
                ? trace.durationMs
                : null;
              const model = isAskTrace(trace) ? trace.model : null;

              return (
                <li key={run.id}>
                  <details>
                    <summary>
                      <span className="advice-question">
                        {run.user_question}
                      </span>
                      <span className="advice-meta">
                        {kind === "memory_audit"
                          ? "Memory Auditor · MCP"
                          : "Ask"}
                        {run.confidence
                          ? ` · ${run.confidence}`
                          : ""}
                        {run.status && run.status !== "completed"
                          ? ` · ${run.status}`
                          : ""}
                        {run.created_at
                          ? ` · ${new Date(
                              run.created_at
                            ).toLocaleString()}`
                          : ""}
                      </span>
                    </summary>

                    <p className="advice-answer">
                      {run.answer || "(no answer stored)"}
                    </p>

                    <dl className="run-meta-grid">
                      {model ? (
                        <>
                          <dt>Model</dt>
                          <dd>{model}</dd>
                        </>
                      ) : null}
                      {typeof durationMs === "number" ? (
                        <>
                          <dt>Duration</dt>
                          <dd>{durationMs}ms</dd>
                        </>
                      ) : null}
                      <dt>Memories used</dt>
                      <dd>{memories.length}</dd>
                      <dt>Actions proposed</dt>
                      <dd>
                        {Array.isArray(run.actions_taken)
                          ? run.actions_taken.length
                          : 0}
                      </dd>
                      {kind === "memory_audit" ? (
                        <>
                          <dt>Tools used</dt>
                          <dd>
                            {Array.isArray(trace)
                              ? trace.length
                              : 0}{" "}
                            MCP calls
                          </dd>
                        </>
                      ) : null}
                      {isAskTrace(trace) && trace.error ? (
                        <>
                          <dt>Error</dt>
                          <dd>{trace.error}</dd>
                        </>
                      ) : null}
                    </dl>

                    {kind === "ask" ? (
                      <>
                        <h5>Run pipeline</h5>
                        <RunPipeline trace={trace} />
                      </>
                    ) : (
                      <>
                        <h5>MCP tool trace</h5>
                        <McpTrace trace={trace} />
                      </>
                    )}

                    {memories.length > 0 ? (
                      <>
                        <h5>Relevant memories used</h5>
                        <ol className="memory-inspector-list">
                          {memories.map((memory, index) => {
                            const similarity = formatSimilarity(
                              memory.similarity
                            );

                            return (
                              <li
                                key={
                                  memory.id ||
                                  `${run.id}-memory-${index}`
                                }
                              >
                                <strong>
                                  {memory.title || "Memory"}
                                </strong>
                                <p className="muted">
                                  Source:{" "}
                                  {memorySourceLabel(memory)}
                                  {similarity
                                    ? ` · Similarity: ${similarity}`
                                    : ""}
                                </p>
                              </li>
                            );
                          })}
                        </ol>
                      </>
                    ) : null}

                    {Array.isArray(run.actions_taken) &&
                      run.actions_taken.length > 0 && (
                        <p className="advice-actions">
                          Actions:{" "}
                          {run.actions_taken
                            .map(
                              (action) =>
                                action.title ||
                                formatLabel(action.type)
                            )
                            .join(", ")}
                        </p>
                      )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}

export default AdviceHistoryPanel;
