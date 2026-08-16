// frontend/src/components/auth/DemoExplore.jsx

import { useEffect, useMemo, useState } from "react";

import { API_BASE_URL } from "../../api.js";
import NeedsBoard from "../dashboard/NeedsBoard.jsx";

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
 * Public read-only explorer for the HouseIQ home selected by
 * PUBLIC_DEMO_HOME_ID. Falls back to the Ranch preview.
 */
export default function DemoExplore({
  onBack,
  loginWithRedirect,
}) {
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
  const needsItems = (demo?.sampleNeeds || []).map(
    (item, index) => ({
      ...item,
      id: item.id || `demo-need-${index}`,
    })
  );
  const citations = demo?.sampleAnswer?.citations || [];

  return (
    <main className="auth-page auth-page--landing demo-explore-page">
      <section className="demo-explore-panel">
        <header className="demo-explore-header">
          <p className="eyebrow">Explore without signing in</p>
          <h1>{home?.name || "HouseIQ Demo Home"}</h1>
          <p className="auth-introduction">
            HouseIQ already knows this home. Here is what
            matters next — with evidence.
          </p>

          <div className="auth-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onBack}
            >
              Back
            </button>
            {typeof loginWithRedirect === "function" && (
              <button
                type="button"
                onClick={() => loginWithRedirect()}
              >
                Log in to use your home
              </button>
            )}
          </div>
        </header>

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

            <NeedsBoard items={needsItems} />

            {demo.sampleAnswer && (
              <section className="panel-block demo-ask-preview">
                <p className="eyebrow">Ask HouseIQ</p>
                <h3>{demo.sampleAnswer.question}</h3>

                <div className="turn-response">
                  <div className="turn-response-header">
                    <span className="turn-response-label">
                      HouseIQ
                    </span>
                  </div>
                  <div className="answer-box">
                    {demo.sampleAnswer.answer}
                  </div>

                  {citations.length > 0 && (
                    <section className="clarifying-section">
                      <h4>Evidence</h4>
                      <ul className="timeline-list">
                        {citations.map((citation, index) => (
                          <li
                            key={
                              citation.id ||
                              `${citation.page}-${index}`
                            }
                          >
                            <strong>
                              {citation.title ||
                                citation.label ||
                                "Source"}
                              {citation.page
                                ? ` · p. ${citation.page}`
                                : ""}
                            </strong>
                            {citation.passage ? (
                              <p className="evidence-quote">
                                &ldquo;{citation.passage}&rdquo;
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </section>
            )}

            <section className="panel-block">
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

            <section className="panel-block">
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
              <section className="panel-block">
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
              <section className="panel-block">
                <h2>Tracked issues</h2>
                <ul className="timeline-list">
                  {demo.issues.slice(0, 12).map((issue) => (
                    <li key={issue.id}>
                      <strong>{issue.title}</strong>
                      <div>
                        {readableLabel(issue.priority)} priority · {readableLabel(issue.status)}
                      </div>
                      {issue.description && <span>{issue.description}</span>}
                      {issue.evidencePassage && (
                        <p className="evidence-quote">
                          {issue.evidencePage
                            ? `p. ${issue.evidencePage} · `
                            : ""}
                          &ldquo;{issue.evidencePassage}&rdquo;
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="panel-block">
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
