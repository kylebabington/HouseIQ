// frontend/src/components/auth/DemoExplore.jsx

import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../api.js";
import NeedsBoard from "../dashboard/NeedsBoard.jsx";

/**
 * Public demo home explorer (no Auth0 required).
 * Renders the real Needs + Ask surfaces against seeded Ranch data.
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
        const response = await fetch(
          `${API_BASE_URL}/demo/home`
        );
        if (!response.ok) {
          throw new Error("Could not load demo home");
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
          <h1>1978 Indianapolis Ranch</h1>
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

        {demo && (
          <>
            <NeedsBoard items={needsItems} />

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
          </>
        )}
      </section>
    </main>
  );
}
