// frontend/src/components/dashboard/NeedsBoard.jsx

function sourceLine(item) {
  const page = item.evidencePage ?? item.evidence_page;
  if (item.sourceLabel && page) {
    return `${item.sourceLabel} · p.${page}`;
  }
  if (item.sourceLabel) {
    return item.sourceLabel;
  }
  if (page) {
    return `p. ${page}`;
  }
  return null;
}

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
        {heading ? <h4>{heading}</h4> : null}
        <ol className="needs-list">
          {list.map((item, index) => {
            const source = sourceLine(item);
            const passage =
              item.evidencePassage || item.evidence_passage;
            const ItemTag = onSelectNeed ? "button" : "div";

            return (
              <li key={`${item.kind}-${item.id || item.title || index}`}>
                <ItemTag
                  type={onSelectNeed ? "button" : undefined}
                  className="needs-item"
                  onClick={
                    onSelectNeed
                      ? () => onSelectNeed(item)
                      : undefined
                  }
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
                      {source ||
                        item.explanation ||
                        item.reason}
                    </span>
                    {passage ? (
                      <span className="evidence-quote">
                        &ldquo;{passage}&rdquo;
                      </span>
                    ) : null}
                  </span>
                </ItemTag>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const hasBuckets =
    buckets["30_days"].length ||
    buckets["90_days"].length ||
    buckets["365_days"].length;

  return (
    <section className="needs-board panel-block">
      <p className="eyebrow">Your home remembers</p>
      <h3>What your house needs</h3>
      <p className="needs-board-intro">
        Ranked plan for the next 30 / 90 / 365 days from
        verified issues, projects, equipment, and climate.
      </p>

      {hasBuckets ? (
        <>
          {renderList(buckets["30_days"], "Next 30 days")}
          {renderList(buckets["90_days"], "Next 90 days")}
          {renderList(buckets["365_days"], "Next 12 months")}
        </>
      ) : (
        renderList(items, null)
      )}
    </section>
  );
}

export default NeedsBoard;
