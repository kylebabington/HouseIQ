// frontend/src/components/home-profile/HomesManager.jsx

import { homeSubtitle } from "../../utils/formatters.js";

function HomesManager({
  homes = [],
  selectedHome,
  onSelectHome,
  homeForm,
  setHomeForm,
  onCreateHome,
  createHomeError,
  homesError,
  onDeleteHome,
  isHomeOwner = false,
  onSeedDemo,
  readOnly = false,
  profile,
}) {
  return (
    <div className="homes-manager">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Properties</p>
          <h3>Your homes</h3>
        </div>
      </div>

      {homesError ? (
        <div className="error-message">
          <strong>Could not load homes</strong>
          <p>{homesError}</p>
        </div>
      ) : null}

      {homes.length === 0 ? (
        <p className="muted">
          Create a home to start HouseIQ&apos;s memory for
          that property.
        </p>
      ) : (
        <ul className="homes-manager-list">
          {homes.map((home) => {
            const isCurrent =
              selectedHome?.id === home.id;

            return (
              <li
                key={home.id}
                className={
                  isCurrent
                    ? "homes-manager-card current"
                    : "homes-manager-card"
                }
              >
                <div>
                  <strong>{home.name}</strong>
                  <span>
                    {homeSubtitle(home, isCurrent ? profile : null) ||
                      (home.year_built
                        ? `Built ${home.year_built}`
                        : "No year recorded")}
                  </span>
                  {isCurrent ? (
                    <span className="homes-manager-current">
                      Current home
                    </span>
                  ) : null}
                </div>

                <div className="homes-manager-actions">
                  {isCurrent ? null : readOnly ? (
                    <span className="muted">
                      Switching homes is disabled in the
                      public demo.
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onSelectHome(home)}
                    >
                      Switch to this home
                    </button>
                  )}

                  {isCurrent &&
                  isHomeOwner &&
                  typeof onDeleteHome === "function" ? (
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      onClick={async () => {
                        try {
                          await onDeleteHome();
                        } catch (error) {
                          console.error(error);
                        }
                      }}
                    >
                      Delete home
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {readOnly ? (
        <section className="overview-card">
          <p className="eyebrow">Demo guardrails</p>
          <h4>Home switching is read-only here</h4>
          <p>
            The public demo shows one configured home.
            Creating, switching, and deleting homes requires
            a signed-in account.
          </p>
        </section>
      ) : (
        <section className="overview-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Add a home</p>
              <h3>Another property</h3>
            </div>
          </div>

          <form onSubmit={onCreateHome} className="stack">
            <label className="form-field">
              <span>Home name</span>
              <input
                value={homeForm.name}
                onChange={(event) =>
                  setHomeForm({
                    ...homeForm,
                    name: event.target.value,
                  })
                }
                placeholder="e.g. Indianapolis Ranch"
              />
            </label>

            <label className="form-field">
              <span>Year built</span>
              <input
                value={homeForm.yearBuilt}
                onChange={(event) =>
                  setHomeForm({
                    ...homeForm,
                    yearBuilt: event.target.value,
                  })
                }
                placeholder="1978"
                type="number"
              />
            </label>

            <label className="form-field">
              <span>Notes</span>
              <textarea
                value={homeForm.notes}
                onChange={(event) =>
                  setHomeForm({
                    ...homeForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Optional notes about this home"
              />
            </label>

            {createHomeError ? (
              <p className="record-inline-error">
                {createHomeError}
              </p>
            ) : null}

            <button type="submit">Create Home</button>
          </form>

          {typeof onSeedDemo === "function" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={onSeedDemo}
            >
              Seed Indianapolis Ranch
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default HomesManager;
