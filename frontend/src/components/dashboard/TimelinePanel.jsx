// frontend/src/components/dashboard/TimelinePanel.jsx

import {
  countLabel,
  formatCurrency,
  formatLabel,
  formatShortDate,
} from "../../utils/formatters.js";
import { groupByYear } from "../../utils/groupByYear.js";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";

function eventDetail(event, documentsById) {
  if (event.source !== "document") {
    return null;
  }

  const documentRecord = documentsById.get(event.id);

  if (!documentRecord) {
    return null;
  }

  const amount =
    documentRecord.metadata?.totalAmount ||
    documentRecord.total_amount;
  const company =
    documentRecord.metadata?.contractorOrCompany ||
    documentRecord.contractor_or_company;

  const parts = [];

  if (Number(amount) > 0) {
    parts.push(formatCurrency(amount));
  }

  if (company) {
    parts.push(company);
  }

  return parts.join(" · ") || null;
}

export default function TimelinePanel({
  events = [],
  documents = [],
  isLoading = false,
  error = "",
  onRefresh,
}) {
  const documentsById = new Map(
    documents.map((documentRecord) => [
      documentRecord.id,
      documentRecord,
    ])
  );

  const yearGroups = groupByYear(
    events,
    (event) => event.occurred_at
  );

  return (
    <CollapsibleSection
      title="Home Timeline"
      summary={countLabel(events.length, "recorded event")}
      defaultOpen
      headerActions={
        typeof onRefresh === "function" ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
          >
            Refresh
          </button>
        ) : null
      }
    >
      {isLoading && <p>Loading timeline…</p>}
      {error && <p className="error-message">{error}</p>}

      {!isLoading && !error && events.length === 0 && (
        <p>
          Events from documents, repairs, assets, and notes will
          appear here as your home memory grows.
        </p>
      )}

      {yearGroups.map(([year, yearEvents]) => (
        <CollapsibleSection
          key={year}
          nested
          variant="row"
          title={String(year)}
          summary={countLabel(yearEvents.length, "event")}
        >
          <ol className="history-tree">
            {yearEvents.map((event) => {
              const detail = eventDetail(
                event,
                documentsById
              );

              return (
                <li
                  key={`${event.source}-${event.id}`}
                >
                  <time>
                    {formatShortDate(event.occurred_at) ||
                      "Undated"}
                  </time>
                  <div>
                    <strong>
                      {event.title || "Untitled event"}
                    </strong>
                    {detail ? (
                      <span>{detail}</span>
                    ) : event.kind ? (
                      <span>
                        {formatLabel(event.source)}
                        {event.kind
                          ? ` · ${formatLabel(event.kind)}`
                          : ""}
                      </span>
                    ) : null}
                    {event.evidence_passage && (
                      <p className="evidence-quote">
                        &ldquo;{event.evidence_passage}&rdquo;
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CollapsibleSection>
      ))}
    </CollapsibleSection>
  );
}
