// frontend/src/components/dashboard/ProposalsPanel.jsx

function ProposalGroup({
  title,
  items,
  kind,
  onAccept,
  onReject,
  isBusy,
}) {
  if (!items?.length) {
    return null;
  }

  return (
    <div className="proposals-group">
      <h3>{title}</h3>
      <ul className="timeline-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>
              {item.title || item.name || "Untitled"}
            </strong>
            {item.content || item.description ? (
              <p>
                {(item.content || item.description || "").slice(
                  0,
                  220
                )}
              </p>
            ) : null}
            {item.evidence_passage && (
              <p className="evidence-quote">
                {item.evidence_page
                  ? `p. ${item.evidence_page} · `
                  : ""}
                &ldquo;{item.evidence_passage}&rdquo;
              </p>
            )}
            <div className="auth-actions" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onAccept(kind, item.id)}
              >
                Accept
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() => onReject(kind, item.id)}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DuplicateFlagGroup({
  flags,
  isBusy,
  onReviewDuplicate,
}) {
  if (!flags?.length) {
    return null;
  }

  return (
    <div className="proposals-group">
      <h3>Possible duplicates</h3>
      <p>
        HouseIQ grouped likely matches automatically. These
        pairs were too uncertain to merge, so they were not
        deleted.
      </p>
      <ul className="timeline-list">
        {flags.map((flag) => (
          <li key={flag.id}>
            <strong>
              {flag.record_kind}: possible duplicate
            </strong>
            {flag.reason ? <p>{flag.reason}</p> : null}
            <p>
              Score{" "}
              {Number(flag.score || 0).toFixed(2)}
            </p>
            <div className="auth-actions" style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  onReviewDuplicate(flag.id, "same")
                }
              >
                Same record
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() =>
                  onReviewDuplicate(flag.id, "distinct")
                }
              >
                Keep both
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProposalsPanel({
  proposals,
  isBusy = false,
  onAccept,
  onReject,
  onAcceptAll,
  onReviewDuplicate,
  hideHeader = false,
}) {
  const total = proposals?.total || 0;

  return (
    <section
      className={hideHeader ? "proposals-embedded" : "panel"}
      id="houseiq-proposals-panel"
    >
      {hideHeader ? (
        <div className="auth-actions">
          {total > 0 ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onAcceptAll}
            >
              Accept all
            </button>
          ) : null}
        </div>
      ) : (
      <header className="panel-header">
        <div>
          <p className="eyebrow">Human in the loop</p>
          <h2>
            {total
              ? `Proposed changes (${total})`
              : "Proposed changes"}
          </h2>
        </div>
        <div className="auth-actions">
          {total > 0 ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onAcceptAll}
            >
              Accept all
            </button>
          ) : null}
        </div>
      </header>
      )}

      {total === 0 ? (
        <p>
          When HouseIQ extracts facts from documents or
          conversations, they land here for your review first.
          Possible duplicates are flagged automatically so you
          can keep one record or both.
        </p>
      ) : null}

      <ProposalGroup
        title="Issues"
        items={proposals?.issues}
        kind="issue"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Projects"
        items={proposals?.projects}
        kind="project"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Assets"
        items={proposals?.assets}
        kind="asset"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Memories"
        items={proposals?.memories}
        kind="memory"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <DuplicateFlagGroup
        flags={proposals?.duplicateFlags}
        isBusy={isBusy}
        onReviewDuplicate={onReviewDuplicate}
      />
    </section>
  );
}
