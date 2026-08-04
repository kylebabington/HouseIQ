// frontend/src/components/memories/ManualMemoryPanel.jsx

// ---------------------------------------------------------
// MANUAL MEMORY TESTING PANEL
// ---------------------------------------------------------
//
// Presentational only. The memory form state and the
// createMemory handler live in useHomeDashboard.
//
function ManualMemoryPanel({
  memoryForm,
  setMemoryForm,
  createMemory,
  memoryFormError,
}) {
  return (
    <details className="manual-panel">
      <summary>
        Manual memory entry for testing
      </summary>

      <form
        onSubmit={createMemory}
        className="stack manual-memory-form"
      >
        <p>
          This form is useful while
          developing, but normal users
          should primarily talk to HouseIQ.
        </p>

        {memoryFormError ? (
          <p className="error-message" role="alert">
            {memoryFormError}
          </p>
        ) : null}
        <input
          value={memoryForm.title}
          onChange={(event) =>
            setMemoryForm({
              ...memoryForm,
              title: event.target.value,
            })
          }
          placeholder="Memory title"
        />

        <select
          value={memoryForm.category}
          onChange={(event) =>
            setMemoryForm({
              ...memoryForm,
              category: event.target.value,
            })
          }
        >
          <option value="general">
            General
          </option>

          <option value="repair">
            Repair
          </option>

          <option value="maintenance">
            Maintenance
          </option>

          <option value="appliance">
            Appliance
          </option>

          <option value="exterior">
            Exterior
          </option>

          <option value="landscaping">
            Landscaping
          </option>

          <option value="inspection">
            Inspection
          </option>
        </select>

        <textarea
          value={memoryForm.content}
          onChange={(event) =>
            setMemoryForm({
              ...memoryForm,
              content: event.target.value,
            })
          }
          placeholder="What should HouseIQ remember?"
        />

        <button type="submit">
          Save Test Memory
        </button>
      </form>
    </details>
  );
}


export default ManualMemoryPanel;
