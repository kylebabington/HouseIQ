// frontend/src/components/dashboard/ProjectsPanel.jsx

import {
  useState,
} from "react";

import api from "../../api.js";

import {
  formatCurrency,
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";

import ProvenanceLine from "../shared/ProvenanceLine.jsx";
import CollapsibleSection from "../layout/CollapsibleSection.jsx";


// ---------------------------------------------------------
// API CONFIGURATION
// ---------------------------------------------------------

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";


// Matches the enums enforced by the backend PATCH routes.
const PROJECT_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
];


function projectSummary(project) {
  const parts = [formatLabel(project.status || "planned")];

  if (
    Number(project.estimated_cost_low) > 0 ||
    Number(project.estimated_cost_high) > 0
  ) {
    parts.push(
      `est. ${formatCurrency(project.estimated_cost_low)}–${formatCurrency(project.estimated_cost_high)}`
    );
  }

  return parts.join(" · ");
}

function ProjectsPanel({
  projects,
  homeId,
  onRecordsChanged,
  onOpenDocument,
  highlightId,
}) {
  const [statusFilter, setStatusFilter] =
    useState("all");
  // Tracks which project or task is currently saving, so its
  // control can disable itself while the request is in flight.
  const [savingKey, setSavingKey] =
    useState(null);

  // Keyed by project id so each card can show its own error.
  const [projectErrors, setProjectErrors] =
    useState({});

  async function handleProjectStatusChange(
    project,
    newStatus
  ) {
    if (
      !homeId ||
      newStatus === project.status
    ) {
      return;
    }

    const savingKeyForProject = `project:${project.id}`;

    setSavingKey(savingKeyForProject);

    setProjectErrors((current) => ({
      ...current,
      [project.id]: "",
    }));

    try {
      await api.patch(
        `${API_URL}/homes/${homeId}/projects/${project.id}`,
        { status: newStatus }
      );

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setProjectErrors((current) => ({
        ...current,

        [project.id]:
          error.response?.data?.error ||
          "Could not update this project.",
      }));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleTaskToggle(
    project,
    task
  ) {
    if (!homeId) {
      return;
    }

    const nextStatus =
      task.status === "done"
        ? "todo"
        : "done";

    const savingKeyForTask = `task:${task.id}`;

    setSavingKey(savingKeyForTask);

    setProjectErrors((current) => ({
      ...current,
      [project.id]: "",
    }));

    try {
      await api.patch(
        `${API_URL}/homes/${homeId}/projects/${project.id}/tasks/${task.id}`,
        { status: nextStatus }
      );

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setProjectErrors((current) => ({
        ...current,

        [project.id]:
          error.response?.data?.error ||
          "Could not update this task.",
      }));
    } finally {
      setSavingKey(null);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state dashboard-empty">
        <h4>No projects planned</h4>

        <p>
          Multi-step repairs and
          maintenance plans created by
          HouseIQ will appear here.
        </p>
      </div>
    );
  }

  const visibleProjects = projects.filter((project) => {
    const status = project.status || "planned";

    if (statusFilter === "planned") {
      return status === "planned";
    }

    if (statusFilter === "active") {
      return status === "in_progress";
    }

    if (statusFilter === "complete") {
      return status === "completed";
    }

    return true;
  });

  return (
    <div className="projects-panel-wrap">
      <div
        className="tab-list"
        role="tablist"
        aria-label="Project status"
      >
        {[
          ["planned", "Planned"],
          ["active", "Active"],
          ["complete", "Complete"],
          ["all", "All"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={statusFilter === id}
            className={
              statusFilter === id
                ? "tab-button active"
                : "tab-button"
            }
            onClick={() => setStatusFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleProjects.length === 0 ? (
        <div className="empty-state dashboard-empty">
          <h4>No {statusFilter} projects</h4>
        </div>
      ) : (
    <div className="record-stack">
      {visibleProjects.map((project) => (
        <CollapsibleSection
          key={project.id}
          id={`record-project-${project.id}`}
          variant="row"
          title={project.title}
          summary={projectSummary(project)}
          defaultOpen={highlightId === project.id}
        >

          <ProvenanceLine
            sourceFileName={
              project.source_file_name
            }
            sourceDocumentType={
              project.source_document_type
            }
            sourceDocumentId={
              project.source_document_id
            }
            evidencePassage={
              project.evidence_passage
            }
            evidencePage={
              project.evidence_page
            }
            evidenceSources={project.evidence}
            onOpenDocument={onOpenDocument}
          />

          {project.description && (
            <p className="record-description">
              {
                project.description
              }
            </p>
          )}

          <div className="project-stats">
            <div>
              <span>
                Estimated range
              </span>

              <strong>
                {formatCurrency(
                  project.estimated_cost_low
                )}
                {" – "}
                {formatCurrency(
                  project.estimated_cost_high
                )}
              </strong>
            </div>

            <div>
              <span>
                DIY difficulty
              </span>

              <strong>
                {formatLabel(
                  project.diy_difficulty
                )}
              </strong>
            </div>
          </div>

          {project.safety_notes && (
            <div className="safety-note">
              <strong>
                Safety note
              </strong>

              <p>
                {
                  project.safety_notes
                }
              </p>
            </div>
          )}

          {project.tasks?.length >
            0 && (
              <div className="task-list">
                <h5>
                  Project tasks
                </h5>

                <ol>
                  {project.tasks.map(
                    (task) => (
                      <li
                        key={
                          task.id
                        }
                        className="task-row"
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              task.status ===
                              "done"
                            }
                            disabled={
                              savingKey ===
                              `task:${task.id}`
                            }
                            onChange={() =>
                              handleTaskToggle(
                                project,
                                task
                              )
                            }
                          />

                          <span>
                            {
                              task.title
                            }
                          </span>
                        </label>

                        <small>
                          {formatLabel(
                            task.status
                          )}
                        </small>
                      </li>
                    )
                  )}
                </ol>
              </div>
            )}

          <div className="record-footer">
            <label className="status-select-field">
              <span>Status</span>

              <select
                className={`status-select status-${project.status}`}
                value={project.status}
                disabled={
                  savingKey ===
                  `project:${project.id}`
                }
                onChange={(event) =>
                  handleProjectStatusChange(
                    project,
                    event.target.value
                  )
                }
              >
                {PROJECT_STATUSES.map(
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
                project.created_at
              )}
            </small>
          </div>

          {projectErrors[project.id] && (
            <p className="record-inline-error">
              {
                projectErrors[project.id]
              }
            </p>
          )}
        </CollapsibleSection>
      ))}
    </div>
      )}
    </div>
  );
}


export default ProjectsPanel;
