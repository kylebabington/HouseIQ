// frontend/src/components/auth/DemoExplore.jsx

import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../api.js";

function formatDate(value) {
  if (!value) {
    return "Date unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function readableLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Public read-only explorer for the real HouseIQ home selected by the backend
 * PUBLIC_DEMO_HOME_ID environment variable.
 */
export default function DemoExplore({ onBack }) {
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/demo/home`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            body.error || "Could not load demo home"
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setDemo(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Demo unavailable");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedDocuments = useMemo(() => {
    const documents = demo?.documents || [];

    return [...documents].sort((a, b) => {
      const aDate = new Date(
        a.documentDate || a.createdAt || 0
      ).getTime();
      const bDate = new Date(
        b.documentDate || b.createdAt || 0
      ).getTime();

      return bDate - aDate;
    });
  }, [demo]);

  const home = demo?.home;
  const profile = demo?.profile;
  const stats = demo?.stats || {};

  return (
    <main className="auth-page auth-page--landing">
      <section className="auth-card demo-explore-panel">
        <p className="eyebrow">Explore without signing in</p>

        <h1>{home?.name || "HouseIQ Demo Home"}</h1>

        <p className="auth-introduction">
          A read-only view of a real HouseIQ home record. The documents,
          assets, issues, and memories below come from the same database-backed
          home used by the signed-in app.
        </p>

        <div className="auth-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
          >
            Back
          </button>
        </div>

        {loading && <p>Loading demo…</p>}
        {error && <p className="error-message">{error}</p>}

        {demo && home && (
          <>
            {demo.source === "fallback" && (
              <p className="status-message">
                The live database demo has not been configured yet. This is
                the temporary fallback preview.
              </p>
            )}

            <section style={{ marginTop: "1.5rem" }}>
              <h2>Property</h2>
              <ul className="timeline-list">
                <li>
                  <strong>
                    {home.yearBuilt
                      ? `Built in ${home.yearBuilt}`
                      : "Build year unknown"}
                  </strong>
                  <div>
                    {[
                      profile?.city,
                      profile?.state,
                      profile?.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Location not listed"}
                  </div>
                </li>

                {profile && (
                  <li>
                    <strong>
                      {readableLabel(profile.propertyType)}
                    </strong>
                    <div>
                      {[
                        profile.bedrooms != null
                          ? `${profile.bedrooms} bedrooms`
                          : null,
                        profile.fullBathrooms != null
                          ? `${profile.fullBathrooms} full baths`
                          : null,
                        profile.stories != null
                          ? `${profile.stories} stories`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </li>
                )}
              </ul>
            </section>

            <section style={{ marginTop: "1.75rem" }}>
              <h2>What HouseIQ knows</h2>
              <ul className="landing-steps">
                <li>
                  <strong>{stats.documents || 0} documents</strong>
                  <span>Inspections, invoices, warranties, manuals, and more.</span>
                </li>
                <li>
                  <strong>{stats.assets || 0} assets</strong>
                  <span>Home systems and equipment identified from the record.</span>
                </li>
                <li>
                  <strong>{stats.issues || 0} issues</strong>
                  <span>Problems and concerns tracked across the home&apos;s history.</span>
                </li>
                <li>
                  <strong>{stats.memories || 0} memories</strong>
                  <span>Long-term facts HouseIQ has retained about the property.</span>
                </li>
              </ul>
            </section>

            {(demo.assets || []).length > 0 && (
              <section style={{ marginTop: "1.75rem" }}>
                <h2>Home systems</h2>
                <ul className="timeline-list">
                  {demo.assets.slice(0, 12).map((asset) => (
                    <li key={asset.id}>
                      <strong>{asset.name}</strong>
                      <div>
                        {[
                          asset.brand,
                          asset.model,
                          asset.location,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {asset.installDate && (
                        <span>
                          Installed {formatDate(asset.installDate)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(demo.issues || []).length > 0 && (
              <section style={{ marginTop: "1.75rem" }}>
                <h2>Tracked issues</h2>
                <ul className="timeline-list">
                  {demo.issues.slice(0, 12).map((issue) => (
                    <li key={issue.id}>
                      <strong>{issue.title}</strong>
                      <div>
                        {readableLabel(issue.priority)} priority · {readableLabel(issue.status)}
                      </div>
                      {issue.description && <span>{issue.description}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section style={{ marginTop: "1.75rem" }}>
              <h2>Document history</h2>

              {sortedDocuments.length === 0 ? (
                <p>
                  No real demo documents are visible yet. Once the canonical
                  demo home is configured, uploaded documents will appear here.
                </p>
              ) : (
                <ul className="timeline-list">
                  {sortedDocuments.map((document) => (
                    <li key={document.id}>
                      <strong>
                        {formatDate(
                          document.documentDate || document.createdAt
                        )}
                        {" — "}
                        {document.fileName || "Home document"}
                      </strong>

                      <div>
                        {readableLabel(document.documentType)}
                        {document.contractorOrCompany
                          ? ` · ${document.contractorOrCompany}`
                          : ""}
                        {document.totalAmount
                          ? ` · $${document.totalAmount}`
                          : ""}
                      </div>

                      {document.summary && (
                        <span>{document.summary}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
