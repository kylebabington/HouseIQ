import { formatCurrency } from "../../utils/formatters.js";
import { groupByYear } from "../../utils/groupByYear.js";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";

function eventWhen(event) {
  if (!event.occurred_at) {
    return null;
  }

  return new Date(event.occurred_at).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  );
}

function eventMeta(event) {
  const parts = [];

  if (event.amount) {
    parts.push(formatCurrency(event.amount));
  }

  if (event.contractor || event.company) {
    parts.push(event.contractor || event.company);
  }

  if (event.source) {
    parts.push(event.source);
  }

  if (event.kind) {
    parts.push(event.kind);
  }

  return parts.join(" · ");
}

export default function TimelinePanel({
  events = [],
  isLoading = false,
  error = "",
  onRefresh,
}) {
  const groups = groupByYear(
    events,
    (event) => event.occurred_at || event.created_at
  );

  return (
    <div className="timeline-page">
      {typeof onRefresh === "function" ? (
        <div className="page-toolbar">
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
          >
            Refresh timeline
          </button>
        </div>
      ) : null}

      {isLoading && <p>Loading timeline…</p>}
      {error && <p className="error-message">{error}</p>}

      {!isLoading && !error && events.length === 0 && (
        <p>
          Events from documents, repairs, assets, and notes will
          appear here as your home memory grows.
        </p>
      )}

      <div className="year-stack timeline-year-stack">
        {groups.map((group, index) => (
          <CollapsibleSection
            key={group.year}
            title={`${group.year} — ${group.items.length} event${
              group.items.length === 1 ? "" : "s"
            }`}
            defaultOpen={index === 0}
          >
            <ul className="home-history-list">
              {group.items.map((event) => {
                const when = eventWhen(event);
                const meta = eventMeta(event);

                return (
                  <li key={`${event.source}-${event.id}`}>
                    <strong>
                      {when
                        ? `${when} — ${event.title || "Untitled event"}`
                        : event.title || "Untitled event"}
                    </strong>
                    {meta ? <div>{meta}</div> : null}
                    {event.evidence_passage ? (
                      <p className="evidence-quote">
                        &ldquo;{event.evidence_passage}&rdquo;
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
