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


function ProjectsPanel({
  projects,
  homeId,
  onRecordsChanged,
}) {
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

  return (
    <div className="record-grid">
      {projects.map((project) => (
        <article
          key={project.id}
          className="record-card project-card"
        >
          <div className="record-card-header">
            <div>
              <span className="record-type">
                Project
              </span>

              <h4>
                {project.title}
              </h4>
            </div>

            <span
              className={`priority-badge priority-${project.priority}`}
            >
              {formatLabel(
                project.priority
              )}
            </span>
          </div>

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
        </article>
      ))}
    </div>
  );
}


export default ProjectsPanel;
