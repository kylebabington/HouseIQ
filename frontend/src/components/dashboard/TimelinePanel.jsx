// frontend/src/components/dashboard/TimelinePanel.jsx

export default function TimelinePanel({
  events = [],
  isLoading = false,
  error = "",
  onRefresh,
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Home history</p>
          <h2>Timeline</h2>
        </div>
        {typeof onRefresh === "function" && (
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
          >
            Refresh
          </button>
        )}
      </header>

      {isLoading && <p>Loading timeline…</p>}
      {error && <p className="error-message">{error}</p>}

      {!isLoading && !error && events.length === 0 && (
        <p>
          Events from documents, repairs, assets, and notes will
          appear here as your home memory grows.
        </p>
      )}

      <ul className="timeline-list">
        {events.map((event) => (
          <li key={`${event.source}-${event.id}`}>
            <strong>
              {event.title || "Untitled event"}
            </strong>
            <div>
              {event.source}
              {event.kind ? ` · ${event.kind}` : ""}
              {event.occurred_at
                ? ` · ${new Date(
                    event.occurred_at
                  ).toLocaleDateString()}`
                : ""}
            </div>
            {event.evidence_passage && (
              <em>&ldquo;{event.evidence_passage}&rdquo;</em>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
