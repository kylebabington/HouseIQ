// frontend/src/components/dashboard/MemoriesPanel.jsx

import {
  formatDate,
  formatLabel,
} from "../../utils/formatters.js";


function MemoriesPanel({ memories }) {
  if (memories.length === 0) {
    return (
      <div className="empty-state dashboard-empty">
        <h4>No memories yet</h4>

        <p>
          HouseIQ will save repairs,
          maintenance history, home facts,
          and useful observations here.
        </p>
      </div>
    );
  }

  return (
    <div className="record-grid">
      {memories.map((memory) => (
        <article
          key={memory.id}
          className="record-card memory-card"
        >
          <div className="record-card-header">
            <div>
              <span className="record-type">
                {formatLabel(
                  memory.category
                )}
              </span>

              <h4>
                {memory.title}
              </h4>
            </div>

            <span className="importance-badge">
              Importance{" "}
              {memory.importance}
            </span>
          </div>

          <p className="record-description">
            {memory.content}
          </p>

          <div className="record-footer">
            <small>
              Remembered{" "}
              {formatDate(
                memory.created_at
              )}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}


export default MemoriesPanel;
