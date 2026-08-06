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
              <em>
                Evidence
                {item.evidence_page
                  ? ` (p. ${item.evidence_page})`
                  : ""}
                : &ldquo;{item.evidence_passage}&rdquo;
              </em>
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

export default function ProposalsPanel({
  proposals,
  isBusy = false,
  onAccept,
  onReject,
  onAcceptAll,
}) {
  const total = proposals?.total || 0;

  if (!total) {
    return (
      <section className="panel">
        <p className="eyebrow">Human in the loop</p>
        <h2>Proposed changes</h2>
        <p>
          When HouseIQ extracts facts from documents or
          conversations, they land here for your review first.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" id="houseiq-proposals-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Human in the loop</p>
          <h2>Proposed changes ({total})</h2>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={onAcceptAll}
        >
          Accept all
        </button>
      </header>

      <ProposalGroup
        title="Issues"
        items={proposals.issues}
        kind="issue"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Projects"
        items={proposals.projects}
        kind="project"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Assets"
        items={proposals.assets}
        kind="asset"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
      <ProposalGroup
        title="Memories"
        items={proposals.memories}
        kind="memory"
        onAccept={onAccept}
        onReject={onReject}
        isBusy={isBusy}
      />
    </section>
  );
}
