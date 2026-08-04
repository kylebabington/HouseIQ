// frontend/src/components/auth/AuthScreens.jsx

// ---------------------------------------------------------
// AUTHENTICATION SCREENS
// ---------------------------------------------------------
//
// These screens replace the entire page while Auth0 is
// resolving the session, when Auth0 reports an error, or
// when nobody is signed in.
//
// getAuthScreen.jsx decides which one to display.
//


// ---------------------------------------------------------
// AUTHENTICATION LOADING SCREEN
// ---------------------------------------------------------

export function AuthLoadingScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">
          HouseIQ
        </p>

        <h1>
          Checking your session
        </h1>

        <p>
          HouseIQ is confirming whether
          you are signed in.
        </p>
      </section>
    </main>
  );
}


// ---------------------------------------------------------
// AUTHENTICATION ERROR SCREEN
// ---------------------------------------------------------

export function AuthErrorScreen({
  authError,
  loginWithRedirect,
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">
          Authentication error
        </p>

        <h1>
          HouseIQ could not sign you in
        </h1>

        <p className="error-message">
          {authError.message}
        </p>

        <button
          type="button"
          onClick={() =>
            loginWithRedirect()
          }
        >
          Try again
        </button>
      </section>
    </main>
  );
}


// ---------------------------------------------------------
// LOGGED-OUT SCREEN
// ---------------------------------------------------------

export function LoginScreen({
  loginWithRedirect,
}) {
  return (
    <main className="auth-page">
      <section className="auth-card brand-hero">
        <p className="eyebrow">
          Agentic home memory
        </p>

        <h1>
          HouseIQ
        </h1>

        <p className="auth-introduction">
          Your private home record,
          repair history, documents,
          equipment, and maintenance
          intelligence in one place.
        </p>

        <div className="auth-actions">
          <button
            type="button"
            onClick={() =>
              loginWithRedirect()
            }
          >
            Log in
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              loginWithRedirect({
                authorizationParams: {
                  screen_hint:
                    "signup",
                },
              })
            }
          >
            Create account
          </button>
        </div>
      </section>
    </main>
  );
}
