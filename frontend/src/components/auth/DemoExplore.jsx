// frontend/src/components/auth/DemoExplore.jsx

import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../api.js";

/**
 * Public demo home explorer (no Auth0 required).
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

  return (
    <main className="auth-page auth-page--landing">
      <section className="auth-card demo-explore-panel">
        <p className="eyebrow">Explore without signing in</p>
        <h1>1978 Indianapolis Ranch</h1>
        <p className="auth-introduction">
          A read-only preview of HouseIQ&apos;s evidence-backed
          home memory and winter plan.
        </p>

        <div className="auth-actions">
          <button type="button" className="secondary-button" onClick={onBack}>
            Back
          </button>
        </div>

        {loading && <p>Loading demo…</p>}
        {error && <p className="error-message">{error}</p>}

        {demo && (
          <>
            <ol className="landing-steps" style={{ marginTop: "1.5rem" }}>
              {demo.story.map((step) => (
                <li key={step.step}>
                  <strong>
                    {step.step}. {step.title}
                  </strong>
                  <span>{step.detail}</span>
                </li>
              ))}
            </ol>

            <h2 style={{ marginTop: "1.75rem" }}>Sample priorities</h2>
            <ul className="timeline-list">
              {demo.sampleNeeds.map((item) => (
                <li key={item.title}>
                  <strong>
                    {item.title} — {item.score}/100
                  </strong>
                  <div>{item.explanation}</div>
                  {item.evidencePassage && (
                    <em>&ldquo;{item.evidencePassage}&rdquo;</em>
                  )}
                </li>
              ))}
            </ul>

            <h2 style={{ marginTop: "1.75rem" }}>
              Sample answer
            </h2>
            <p>
              <strong>Q:</strong> {demo.sampleAnswer.question}
            </p>
            <p>{demo.sampleAnswer.answer}</p>
          </>
        )}
      </section>
    </main>
  );
}
