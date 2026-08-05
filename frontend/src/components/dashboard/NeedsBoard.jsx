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

  const buckets = {
    "30_days": items.filter(
      (item) => item.timingBucket === "30_days"
    ),
    "90_days": items.filter(
      (item) => item.timingBucket === "90_days"
    ),
    "365_days": items.filter(
      (item) =>
        item.timingBucket === "365_days" ||
        !item.timingBucket
    ),
  };

  function renderList(list, heading) {
    if (!list.length) {
      return null;
    }

    return (
      <div className="needs-bucket">
        <h4>{heading}</h4>
        <ol className="needs-list">
          {list.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                className="needs-item"
                onClick={() => onSelectNeed?.(item)}
              >
                <span
                  className={`priority-badge priority-${item.priority || "medium"}`}
                >
                  {typeof item.score === "number"
                    ? `${item.score}`
                    : item.priority || "medium"}
                </span>
                <span className="needs-item-body">
                  <strong>{item.title}</strong>
                  <span className="needs-reason">
                    {item.explanation || item.reason}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <section className="needs-board panel-block">
      <p className="eyebrow">Your home remembers</p>
      <h3>What your house needs</h3>
      <p className="needs-board-intro">
        Ranked plan for the next 30 / 90 / 365 days from
        verified issues, projects, equipment, and climate.
      </p>

      {renderList(buckets["30_days"], "Next 30 days")}
      {renderList(buckets["90_days"], "Next 90 days")}
      {renderList(buckets["365_days"], "Next 12 months")}
    </section>
  );
}

export default NeedsBoard;
