// frontend/src/components/dashboard/ProjectsPanel.jsx

import {
  formatCurrency,
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


function ProjectsPanel({ projects }) {
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
                {" â€“ "}
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
                      >
                        <span>
                          {
                            task.title
                          }
                        </span>

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
            <span
              className={`status-badge status-${project.status}`}
            >
              {formatLabel(
                project.status
              )}
            </span>

            <small>
              {formatDate(
                project.created_at
              )}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}


export default ProjectsPanel;
