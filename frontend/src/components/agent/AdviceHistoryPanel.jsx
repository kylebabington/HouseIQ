// frontend/src/components/agent/AdviceHistoryPanel.jsx

import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import { countLabel } from "../../utils/formatters.js";

/**
 * Persisted advice from agent_runs — the house's counsel over time.
 */
function AdviceHistoryPanel({
  runs,
  isLoading,
  error,
}) {
  const count = runs?.length || 0;

  return (
    <CollapsibleSection
      title="Previous Advice"
      summary={
        count
          ? countLabel(count, "conversation")
          : "No conversations yet"
      }
    >
      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : count === 0 ? (
        <p>
          Past questions remain here as a record. Follow up
          on recent answers in the conversation above.
        </p>
      ) : (
        <ul className="advice-history-list">
          {runs.map((run) => (
            <li key={run.id}>
              <details>
                <summary>
                  <span className="advice-question">
                    {run.user_question}
                  </span>
                  <span className="advice-meta">
                    {run.confidence} ·{" "}
                    {run.created_at
                      ? new Date(
                          run.created_at
                        ).toLocaleString()
                      : ""}
                  </span>
                </summary>
                <p className="advice-answer">
                  {run.answer || "(no answer stored)"}
                </p>
                {Array.isArray(run.actions_taken) &&
                  run.actions_taken.length > 0 && (
                    <p className="advice-actions">
                      Actions:{" "}
                      {run.actions_taken
                        .map(
                          (action) =>
                            action.title ||
                            action.type
                        )
                        .join(", ")}
                    </p>
                  )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

export default AdviceHistoryPanel;
