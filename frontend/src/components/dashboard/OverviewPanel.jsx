// frontend/src/components/dashboard/OverviewPanel.jsx

import NeedsBoard from "./NeedsBoard.jsx";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import {
  countLabel,
  formatLabel,
  formatShortDate,
} from "../../utils/formatters.js";

function countNeeds(items) {
  const list = items || [];

  return {
    urgent: list.filter(
      (item) => item.timingBucket === "30_days"
    ).length,
    upcoming: list.filter(
      (item) => item.timingBucket === "90_days"
    ).length,
    seasonal: list.filter(
      (item) =>
        item.timingBucket === "365_days" ||
        !item.timingBucket
    ).length,
  };
}

function OverviewPanel({
  counts,
  needsItems,
  isLoadingNeeds,
  needsError,
  onSelectNeed,
  recentEvents = [],
  proposalsTotal = 0,
  proposalsSlot = null,
  onNavigate,
  readOnly = false,
}) {
  const needCounts = countNeeds(needsItems);
  const urgentItems = (needsItems || []).filter(
    (item) => item.timingBucket === "30_days"
  );
  const upcomingItems = (needsItems || []).filter(
    (item) => item.timingBucket === "90_days"
  );
  const thisYear = new Date().getFullYear();
  const eventsThisYear = recentEvents.filter((event) => {
    if (!event.occurred_at) {
      return false;
    }

    const year = new Date(event.occurred_at).getFullYear();
    return year === thisYear;
  }).length;

  const needsSummary = [
    `${needCounts.urgent} urgent`,
    `${needCounts.upcoming} upcoming`,
  ].join(" · ");

  return (
    <div className="overview-page">
      <div className="dashboard-summary overview-summary">
        <div>
          <strong>{counts.issues}</strong>
          <span>Issues</span>
        </div>
        <div>
          <strong>{counts.projects}</strong>
          <span>Projects</span>
        </div>
        <div>
          <strong>{counts.assets}</strong>
          <span>Assets</span>
        </div>
        <div>
          <strong>{counts.memories}</strong>
          <span>Memories</span>
        </div>
        <div>
          <strong>{counts.documents}</strong>
          <span>Documents</span>
        </div>
      </div>

      <CollapsibleSection
        title="Needs Attention"
        summary={needsSummary}
        defaultOpen
        openOnMobile
      >
        <NeedsBoard
          items={urgentItems.length ? urgentItems : needsItems}
          isLoading={isLoadingNeeds}
          error={needsError}
          onSelectNeed={onSelectNeed}
          compact
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Upcoming Maintenance"
        summary={`${countLabel(upcomingItems.length, "task")} in next 90 days`}
      >
        <NeedsBoard
          items={upcomingItems}
          onSelectNeed={onSelectNeed}
          compact
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Recent Home Activity"
        summary={
          eventsThisYear
            ? `${countLabel(eventsThisYear, "update")} this year`
            : countLabel(recentEvents.length, "update")
        }
        headerActions={
          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate("history")}
          >
            View History
          </button>
        }
      >
        {recentEvents.length === 0 ? (
          <p className="muted">
            Events from documents, repairs, and notes
            will appear here as this home&apos;s memory
            grows.
          </p>
        ) : (
          <ul className="recent-activity-list">
            {recentEvents.map((event) => (
              <li key={`${event.source}-${event.id}`}>
                <span>
                  {formatShortDate(event.occurred_at) ||
                    "Undated"}
                </span>
                <strong>
                  {event.title || "Untitled event"}
                </strong>
                {event.source ? (
                  <em>{formatLabel(event.source)}</em>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="HouseIQ Suggestions"
        summary={
          proposalsTotal > 0
            ? `${countLabel(proposalsTotal, "change")} awaiting review`
            : "None awaiting review"
        }
      >
        {proposalsSlot}
      </CollapsibleSection>

      <section className="overview-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Shortcuts</p>
            <h3>Quick actions</h3>
          </div>
        </div>

        <div className="demo-cta-buttons">
          <button
            type="button"
            onClick={() => onNavigate("ask", { focus: true })}
          >
            Ask HouseIQ
          </button>

          {readOnly ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onNavigate("documents")}
            >
              View Documents
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onNavigate("documents")}
            >
              Upload Document
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate("history")}
          >
            View History
          </button>
        </div>
      </section>
    </div>
  );
}

export default OverviewPanel;
