// frontend/src/components/dashboard/IssuesPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";

import ProvenanceLine from "../shared/ProvenanceLine.jsx";


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
  onOpenDocument,
  highlightId,
}) {
  const [savingIssueId, setSavingIssueId] =
    useState(null);

  const [issueErrors, setIssueErrors] =
    useState({});

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    category: "general",
  });

  const [createError, setCreateError] =
    useState("");
  const [isCreating, setIsCreating] =
    useState(false);
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

  async function createIssue(event) {
    event.preventDefault();

    if (!homeId) {
      return;
    }

    if (!createForm.title.trim()) {
      setCreateError("Title is required.");
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      await api.post(
        `${API_URL}/homes/${homeId}/issues`,
        {
          title: createForm.title.trim(),
          description:
            createForm.description.trim(),
          priority: createForm.priority,
          category: createForm.category,
        }
      );

      setCreateForm({
        title: "",
        description: "",
        priority: "medium",
        category: "general",
      });

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setCreateError(
        error.response?.data?.error ||
          "Could not create this issue."
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="issues-panel-wrap">
      <form
        className="stack manual-create-form"
        onSubmit={createIssue}
      >
        <h4>Add an issue manually</h4>
        <input
          value={createForm.title}
          onChange={(event) =>
            setCreateForm({
              ...createForm,
              title: event.target.value,
            })
          }
          placeholder="Issue title"
        />
        <textarea
          value={createForm.description}
          onChange={(event) =>
            setCreateForm({
              ...createForm,
              description: event.target.value,
            })
          }
          placeholder="What is going wrong?"
        />
        <select
          value={createForm.priority}
          onChange={(event) =>
            setCreateForm({
              ...createForm,
              priority: event.target.value,
            })
          }
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" disabled={isCreating}>
          {isCreating ? "Saving…" : "Save issue"}
        </button>
        {createError ? (
          <p className="error-message" role="alert">
            {createError}
          </p>
        ) : null}
      </form>

      {issues.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <h4>No issues recorded</h4>
          <p>
            Tell HouseIQ about a leak,
            malfunction, odor, recurring
            problem, or safety concern.
          </p>
        </div>
      ) : (
    <div className="record-grid">
      {issues.map((issue) => (
        <article
          key={issue.id}
          id={`record-issue-${issue.id}`}
          className={
            highlightId === issue.id
              ? "record-card issue-card record-highlight"
              : "record-card issue-card"
          }
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

          <ProvenanceLine
            sourceFileName={
              issue.source_file_name
            }
            sourceDocumentType={
              issue.source_document_type
            }
            sourceDocumentId={
              issue.source_document_id
            }
            evidencePassage={
              issue.evidence_passage
            }
            evidencePage={
              issue.evidence_page
            }
            onOpenDocument={onOpenDocument}
          />

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
      )}
    </div>
  );
}


export default IssuesPanel;
