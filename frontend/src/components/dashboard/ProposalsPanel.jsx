function ProposalGroup({
  title,
  items,
  kind,
  onAccept,
  onReject,
  isBusy,
  readOnly = false,
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
            {readOnly ? null : (
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
            )}
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
  hideHeader = false,
  readOnly = false,
}) {
  const total = proposals?.total || 0;

  if (!total) {
    return (
      <p className="muted">
        When HouseIQ extracts facts from documents or
        conversations, they land here for your review first.
      </p>
    );
  }

  return (
    <section id="houseiq-proposals-panel">
      {hideHeader ? null : (
        <header className="panel-header">
          <div>
            <p className="eyebrow">Human in the loop</p>
            <h2>Proposed changes ({total})</h2>
          </div>
        </header>
      )}

      {readOnly ? (
        <p className="muted">
          These suggestions are visible in the public demo but
          cannot be accepted here.
        </p>
      ) : (
        <button
          type="button"
          disabled={isBusy}
          onClick={onAcceptAll}
        >
          Accept all
        </button>
      )}

      <ProposalGroup
        title="Issues"
        items={proposals.issues}
        kind="issue"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
        readOnly={readOnly}
      />
      <ProposalGroup
        title="Projects"
        items={proposals.projects}
        kind="project"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
        readOnly={readOnly}
      />
      <ProposalGroup
        title="Assets"
        items={proposals.assets}
        kind="asset"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
        readOnly={readOnly}
      />
      <ProposalGroup
        title="Memories"
        items={proposals.memories}
        kind="memory"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
        readOnly={readOnly}
      />
    </section>
  );
}
