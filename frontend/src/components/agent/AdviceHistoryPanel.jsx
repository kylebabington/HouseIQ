// frontend/src/components/agent/AdviceHistoryPanel.jsx

/**
 * Persisted advice from agent_runs — the house's counsel over time.
 */
function AdviceHistoryPanel({
  runs,
  isLoading,
  error,
}) {
  if (isLoading) {
    return (
      <section className="advice-history panel-block">
        <h4>Advice history</h4>
        <p className="muted">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="advice-history panel-block">
        <h4>Advice history</h4>
        <p className="error-message" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <section className="advice-history panel-block">
        <h4>Advice history</h4>
        <p>
          Past questions and answers will appear here
          so counsel accumulates with the home.
        </p>
      </section>
    );
  }

  return (
    <section className="advice-history panel-block">
      <h4>Advice history</h4>
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
    </section>
  );
}

export default AdviceHistoryPanel;
