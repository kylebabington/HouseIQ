import CollapsibleSection from "../layout/CollapsibleSection.jsx";
import NeedsBoard from "./NeedsBoard.jsx";
import ProposalsPanel from "./ProposalsPanel.jsx";

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
        item.kind === "seasonal"
    ).length,
  };
}

function activityLine(event) {
  const when = event.occurred_at
    ? new Date(event.occurred_at).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" }
      )
    : null;

  const title = event.title || "Home update";
  return when ? `${when} — ${title}` : title;
}

/**
 * Overview answers "what's going on with my house?"
 * No giant record lists — summaries and jumps only.
 */
function OverviewPage({
  needsItems,
  isLoadingNeeds,
  needsError,
  onSelectNeed,
  timelineEvents = [],
  proposals,
  isUpdatingProposal,
  onAcceptProposal,
  onRejectProposal,
  onAcceptAllProposals,
  proposalsReadOnly = false,
  showUploadAction = true,
  onNavigate,
}) {
  const counts = countNeeds(needsItems);
  const recent = (timelineEvents || []).slice(0, 8);
  const proposalTotal = proposals?.total || 0;
  const upcoming = (needsItems || []).filter(
    (item) =>
      item.timingBucket === "90_days" ||
      item.timingBucket === "365_days"
  );

  const needsSummary = [
    counts.urgent ? `${counts.urgent} urgent` : null,
    counts.upcoming ? `${counts.upcoming} upcoming` : null,
    counts.seasonal ? `${counts.seasonal} seasonal` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Nothing urgent";

  return (
    <div className="workspace-page overview-page">
      <CollapsibleSection
        title={`Needs Attention — ${needsSummary}`}
        defaultOpen
        priority
      >
        <NeedsBoard
          items={needsItems}
          isLoading={isLoadingNeeds}
          error={needsError}
          onSelectNeed={onSelectNeed}
          hideHeader
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={
          upcoming.length
            ? `Upcoming Maintenance — ${upcoming.length} task${
                upcoming.length === 1 ? "" : "s"
              } in the next year`
            : "Upcoming Maintenance — no scheduled tasks yet"
        }
        defaultOpen={false}
      >
        {upcoming.length === 0 ? (
          <p className="muted">
            Seasonal and 90-day work will land here as HouseIQ
            learns this home&apos;s systems.
          </p>
        ) : (
          <NeedsBoard
            items={upcoming}
            onSelectNeed={onSelectNeed}
            hideHeader
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={
          recent.length
            ? `Recent Home Activity — ${recent.length} update${
                recent.length === 1 ? "" : "s"
              }`
            : "Recent Home Activity — no events yet"
        }
        defaultOpen={false}
      >
        {recent.length === 0 ? (
          <p className="muted">
            Uploads, repairs, and inspections will show up here
            as the home record grows.
          </p>
        ) : (
          <ul className="activity-list">
            {recent.map((event) => (
              <li key={`${event.source}-${event.id}`}>
                {activityLine(event)}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={
          proposalTotal
            ? `HouseIQ Suggestions — ${proposalTotal} awaiting review`
            : "HouseIQ Suggestions — none awaiting review"
        }
        defaultOpen={proposalTotal > 0}
      >
        <ProposalsPanel
          proposals={proposals}
          isBusy={isUpdatingProposal}
          onAccept={onAcceptProposal}
          onReject={onRejectProposal}
          onAcceptAll={onAcceptAllProposals}
          hideHeader
          readOnly={proposalsReadOnly}
        />
      </CollapsibleSection>

      <section className="quick-actions">
        <h2 className="quick-actions-title">
          Quick Actions
        </h2>
        <div className="quick-actions-row">
          <button
            type="button"
            onClick={() => onNavigate?.("ask")}
          >
            Ask HouseIQ
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate?.("documents")}
          >
            {showUploadAction ? "Upload Document" : "View Documents"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate?.("history")}
          >
            View History
          </button>
        </div>
      </section>
    </div>
  );
}

export default OverviewPage;
