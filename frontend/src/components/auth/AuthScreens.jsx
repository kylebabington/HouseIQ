// frontend/src/components/auth/AuthScreens.jsx

import { useState } from "react";

import DemoExplore from "./DemoExplore.jsx";

// ---------------------------------------------------------
// AUTHENTICATION SCREENS
// ---------------------------------------------------------

export function AuthLoadingScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">HouseIQ</p>
        <h1>Checking your session</h1>
        <p>
          HouseIQ is confirming whether you are signed in.
        </p>
      </section>
    </main>
  );
}

export function AuthErrorScreen({
  authError,
  loginWithRedirect,
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Authentication error</p>
        <h1>HouseIQ could not sign you in</h1>
        <p className="error-message">{authError.message}</p>
        <button
          type="button"
          onClick={() => loginWithRedirect()}
        >
          Try again
        </button>
      </section>
    </main>
  );
}

/**
 * Logged-out marketing surface: transformation story + demo explore.
 */
export function LoginScreen({
  loginWithRedirect,
  onExploreDemo,
}) {
  return (
    <main className="auth-page auth-page--landing">
      <section className="auth-card brand-hero landing-hero">
        <p className="eyebrow">Your home&apos;s history, evidence, and next move</p>
        <h1>HouseIQ</h1>
        <p className="auth-introduction">
          Turn every inspection, invoice, repair, and conversation into an
          evidence-backed memory of your home—then see what matters next and why.
        </p>

        <div className="auth-actions">
          <button
            type="button"
            onClick={() => loginWithRedirect()}
          >
            Log in
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              loginWithRedirect({
                authorizationParams: {
                  screen_hint: "signup",
                },
              })
            }
          >
            Create account
          </button>
          {typeof onExploreDemo === "function" && (
            <button
              type="button"
              className="secondary-button"
              onClick={onExploreDemo}
            >
              Explore demo home
            </button>
          )}
        </div>
      </section>

      <section className="landing-story" aria-label="How HouseIQ works">
        <h2>From scattered paperwork to a trusted plan</h2>
        <ol className="landing-steps">
          <li>
            <strong>Upload an inspection</strong>
            <span>HouseIQ proposes assets, issues, and facts with source quotes.</span>
          </li>
          <li>
            <strong>Approve what is true</strong>
            <span>You stay the authority—nothing becomes fact until you accept it.</span>
          </li>
          <li>
            <strong>Ask what matters next</strong>
            <span>Get a ranked plan with evidence you can open and share.</span>
          </li>
        </ol>
        <p className="landing-privacy">
          Documents stay private. Original files are stored securely and opened
          only through short-lived links you control.
        </p>
      </section>
    </main>
  );
}

export function LoggedOutFlow({ loginWithRedirect }) {
  const [mode, setMode] = useState("login");

  if (mode === "demo") {
    return (
      <DemoExplore onBack={() => setMode("login")} />
    );
  }

  return (
    <LoginScreen
      loginWithRedirect={loginWithRedirect}
      onExploreDemo={() => setMode("demo")}
    />
  );
}
