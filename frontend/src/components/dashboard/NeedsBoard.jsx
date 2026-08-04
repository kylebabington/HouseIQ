// frontend/src/components/dashboard/NeedsBoard.jsx

/**
 * Proactive "what your house needs" board — retrieval without asking.
 */
function NeedsBoard({
  items,
  isLoading,
  error,
  onSelectNeed,
}) {
  if (isLoading) {
    return (
      <section className="needs-board panel-block">
        <p className="eyebrow">Your home remembers</p>
        <h3>What your house needs</h3>
        <p className="muted">Loading priorities…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="needs-board panel-block">
        <p className="eyebrow">Your home remembers</p>
        <h3>What your house needs</h3>
        <p className="error-message" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!items || items.length === 0) {
    return (
      <section className="needs-board panel-block">
        <p className="eyebrow">Your home remembers</p>
        <h3>What your house needs</h3>
        <p>
          Nothing urgent from what HouseIQ knows yet.
          Upload a document or finish onboarding to
          densify this home&apos;s memory.
        </p>
      </section>
    );
  }

  return (
    <section className="needs-board panel-block">
      <p className="eyebrow">Your home remembers</p>
      <h3>What your house needs</h3>
      <p className="needs-board-intro">
        Ranked from open issues, active projects,
        equipment age, and local season — before you ask.
      </p>

      <ol className="needs-list">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              className="needs-item"
              onClick={() =>
                onSelectNeed?.(item)
              }
            >
              <span className={`priority-badge priority-${item.priority || "medium"}`}>
                {item.priority || "medium"}
              </span>
              <span className="needs-item-body">
                <strong>{item.title}</strong>
                <span className="needs-reason">
                  {item.reason}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default NeedsBoard;
