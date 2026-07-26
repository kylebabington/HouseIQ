// frontend/src/components/dashboard/MemoriesPanel.jsx

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


function createFormFromMemory(memory) {
  return {
    title: memory.title || "",
    content: memory.content || "",
  };
}


function MemoriesPanel({
  memories,
  homeId,
  onRecordsChanged,
}) {
  // The id of the memory currently in edit mode, or null.
  const [editingMemoryId, setEditingMemoryId] =
    useState(null);

  const [memoryForm, setMemoryForm] =
    useState(null);

  const [isSaving, setIsSaving] =
    useState(false);

  const [deletingMemoryId, setDeletingMemoryId] =
    useState(null);

  // Keyed by memory id so each card can show its own error.
  const [memoryErrors, setMemoryErrors] =
    useState({});

  function startEditing(memory) {
    setEditingMemoryId(memory.id);
    setMemoryForm(
      createFormFromMemory(memory)
    );

    setMemoryErrors((current) => ({
      ...current,
      [memory.id]: "",
    }));
  }

  function cancelEditing(memory) {
    setEditingMemoryId(null);
    setMemoryForm(null);

    setMemoryErrors((current) => ({
      ...current,
      [memory.id]: "",
    }));
  }

  async function saveMemory(memory) {
    if (!homeId || !memoryForm) {
      return;
    }

    if (!memoryForm.content.trim()) {
      setMemoryErrors((current) => ({
        ...current,

        [memory.id]:
          "Content cannot be empty.",
      }));

      return;
    }

    setIsSaving(true);

    setMemoryErrors((current) => ({
      ...current,
      [memory.id]: "",
    }));

    try {
      await api.patch(
        `${API_URL}/homes/${homeId}/memories/${memory.id}`,
        {
          title:
            memoryForm.title.trim() ||
            "Untitled memory",

          content:
            memoryForm.content.trim(),
        }
      );

      setEditingMemoryId(null);
      setMemoryForm(null);

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setMemoryErrors((current) => ({
        ...current,

        [memory.id]:
          error.response?.data?.error ||
          "Could not update this memory.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMemory(memory) {
    if (!homeId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete the memory "${memory.title}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingMemoryId(memory.id);

    setMemoryErrors((current) => ({
      ...current,
      [memory.id]: "",
    }));

    try {
      await api.delete(
        `${API_URL}/homes/${homeId}/memories/${memory.id}`
      );

      if (onRecordsChanged) {
        await onRecordsChanged();
      }
    } catch (error) {
      setMemoryErrors((current) => ({
        ...current,

        [memory.id]:
          error.response?.data?.error ||
          "Could not delete this memory.",
      }));
    } finally {
      setDeletingMemoryId(null);
    }
  }

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
      {memories.map((memory) => {
        const isEditing =
          editingMemoryId === memory.id;

        const isDeleting =
          deletingMemoryId === memory.id;

        return (
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

                {!isEditing && (
                  <h4>
                    {memory.title}
                  </h4>
                )}
              </div>

              <span className="importance-badge">
                Importance{" "}
                {memory.importance}
              </span>
            </div>

            {isEditing ? (
              <div className="record-edit-form">
                <label>
                  <span>Title</span>

                  <input
                    value={
                      memoryForm.title
                    }
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        title: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Content</span>

                  <textarea
                    value={
                      memoryForm.content
                    }
                    onChange={(event) =>
                      setMemoryForm({
                        ...memoryForm,
                        content: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="record-actions">
                  <button
                    type="button"
                    className="small-button"
                    disabled={isSaving}
                    onClick={() =>
                      saveMemory(memory)
                    }
                  >
                    {isSaving
                      ? "Saving…"
                      : "Save"}
                  </button>

                  <button
                    type="button"
                    className="small-button text-button"
                    disabled={isSaving}
                    onClick={() =>
                      cancelEditing(memory)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="record-description">
                  {memory.content}
                </p>

                <div className="record-actions">
                  <button
                    type="button"
                    className="small-button secondary-button"
                    onClick={() =>
                      startEditing(memory)
                    }
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="small-button text-button"
                    disabled={isDeleting}
                    onClick={() =>
                      deleteMemory(memory)
                    }
                  >
                    {isDeleting
                      ? "Deleting…"
                      : "Delete"}
                  </button>
                </div>
              </>
            )}

            {memoryErrors[memory.id] && (
              <p className="record-inline-error">
                {memoryErrors[memory.id]}
              </p>
            )}

            <div className="record-footer">
              <small>
                Remembered{" "}
                {formatDate(
                  memory.created_at
                )}
              </small>
            </div>
          </article>
        );
      })}
    </div>
  );
}


export default MemoriesPanel;
