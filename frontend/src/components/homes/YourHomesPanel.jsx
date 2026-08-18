/**
 * Home switching and create-home used to live in a permanent
 * 330px sidebar. They now live on Home → Your Homes.
 */
function YourHomesPanel({
  homes,
  selectedHome,
  homesError,
  homeForm,
  setHomeForm,
  onSelectHome,
  onCreateHome,
  createHomeError,
  onDeleteHome,
  canCreate = true,
  canDelete = false,
  readOnly = false,
}) {
  return (
    <div className="your-homes-panel">
      {homesError ? (
        <div className="error-message">
          <strong>Could not load homes</strong>
          <p>{homesError}</p>
        </div>
      ) : null}

      <div className="home-list">
        {(homes || []).map((home) => {
          const isCurrent = selectedHome?.id === home.id;

          return (
            <div
              key={home.id}
              className={
                isCurrent
                  ? "home-switch-card current"
                  : "home-switch-card"
              }
            >
              <div>
                <strong>{home.name}</strong>
                {home.year_built ? (
                  <span>Built {home.year_built}</span>
                ) : null}
                {isCurrent ? (
                  <span className="home-current-flag">
                    Current home
                  </span>
                ) : null}
              </div>

              {isCurrent ? null : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={readOnly}
                  onClick={() => onSelectHome?.(home)}
                >
                  Switch to this home
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canCreate && !readOnly ? (
        <form onSubmit={onCreateHome} className="stack add-home-form">
          <h3>Add a home</h3>
          <input
            value={homeForm?.name || ""}
            onChange={(event) =>
              setHomeForm({
                ...homeForm,
                name: event.target.value,
              })
            }
            placeholder="Home name, e.g. 1978 Ranch"
          />
          <input
            value={homeForm?.yearBuilt || ""}
            onChange={(event) =>
              setHomeForm({
                ...homeForm,
                yearBuilt: event.target.value,
              })
            }
            placeholder="Year built"
            type="number"
          />
          <textarea
            value={homeForm?.notes || ""}
            onChange={(event) =>
              setHomeForm({
                ...homeForm,
                notes: event.target.value,
              })
            }
            placeholder="General notes about this home"
          />
          {createHomeError ? (
            <p className="record-inline-error">
              {createHomeError}
            </p>
          ) : null}
          <button type="submit">Create Home</button>
        </form>
      ) : null}

      {canDelete && selectedHome && !readOnly ? (
        <button
          type="button"
          className="secondary-button danger-button"
          onClick={async () => {
            try {
              await onDeleteHome?.();
            } catch (error) {
              console.error(error);
            }
          }}
        >
          Delete current home
        </button>
      ) : null}
    </div>
  );
}

export default YourHomesPanel;
