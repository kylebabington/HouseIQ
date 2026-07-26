// frontend/src/components/dashboard/IssuesPanel.jsx

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


function IssuesPanel({ issues }) {
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
            <span
              className={`status-badge status-${issue.status}`}
            >
              {formatLabel(
                issue.status
              )}
            </span>

            <small>
              {formatDate(
                issue.created_at
              )}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}


export default IssuesPanel;
