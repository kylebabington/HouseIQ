// frontend/src/components/dashboard/IssuesPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";


// Matches the enum enforced by the backend PATCH route.
const ISSUE_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];


function IssuesPanel({
  issues,
  homeId,
  onRecordsChanged,
}) {
  // Tracks the issue currently being saved, so its status
  // select can disable itself while the request is in flight.
  const [savingIssueId, setSavingIssueId] =
    useState(null);

  // Keyed by issue id so each card can show its own error
  // without affecting the others.
  const [issueErrors, setIssueErrors] =
    useState({});

  async function handleStatusChange(
    issue,
    newStatus
  ) {
    if (!homeId || newStatus === issue.status) {
      return;
    }

    setSavingIssueId(issue.id);

    setIssueErrors((current) => ({
      ...current,
      [issue.id]: "",
    }));

    try {
      await api.patch(
        `${API_URL}/homes/${homeId}/issues/${issue.id}`,
        { status: newStatus }
      );

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setIssueErrors((current) => ({
        ...current,

        [issue.id]:
          error.response?.data?.error ||
          "Could not update this issue.",
      }));
    } finally {
      setSavingIssueId(null);
    }
  }

  if (issues.length === 0) {
    return (
      <div className="empty-state dashboard-empty">
        <h4>No issues recorded</h4>

        <p>
          Tell HouseIQ about a leak,
          malfunction, odor, recurring
          problem, or safety concern.
        </p>
      </div>
    );
  }

  return (
    <div className="record-grid">
      {issues.map((issue) => (
        <article
          key={issue.id}
          className="record-card issue-card"
        >
          <div className="record-card-header">
            <div>
              <span className="record-type">
                {formatLabel(
                  issue.category
                )}
              </span>

              <h4>{issue.title}</h4>
            </div>

            <span
              className={`priority-badge priority-${issue.priority}`}
            >
              {formatLabel(
                issue.priority
              )}
            </span>
          </div>

          <p className="record-description">
            {issue.description}
          </p>

          {issue.suspected_cause && (
            <div className="record-detail">
              <strong>
                Suspected cause
              </strong>

              <span>
                {
                  issue.suspected_cause
                }
              </span>
            </div>
          )}

          {issue.recommended_next_step && (
            <div className="record-detail">
              <strong>
                Recommended next
                step
              </strong>

              <span>
                {
                  issue.recommended_next_step
                }
              </span>
            </div>
          )}

          <div className="record-footer">
            <label className="status-select-field">
              <span>Status</span>

              <select
                className={`status-select status-${issue.status}`}
                value={issue.status}
                disabled={
                  savingIssueId === issue.id
                }
                onChange={(event) =>
                  handleStatusChange(
                    issue,
                    event.target.value
                  )
                }
              >
                {ISSUE_STATUSES.map(
                  (status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {formatLabel(status)}
                    </option>
                  )
                )}
              </select>
            </label>

            <small>
              {formatDate(
                issue.created_at
              )}
            </small>
          </div>

          {issueErrors[issue.id] && (
            <p className="record-inline-error">
              {issueErrors[issue.id]}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}


export default IssuesPanel;
