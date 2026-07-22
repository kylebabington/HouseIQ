// frontend/src/main.jsx

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";

import "./index.css";
import App from "./App.jsx";


// ---------------------------------------------------------
// AUTH0 CONFIGURATION
// ---------------------------------------------------------
//
// Vite exposes frontend environment variables through:
//
// import.meta.env
//
// Only variables beginning with VITE_ are exposed to browser code.
//
const auth0Domain =
  import.meta.env.VITE_AUTH0_DOMAIN;

const auth0ClientId =
  import.meta.env.VITE_AUTH0_CLIENT_ID;

const auth0Audience =
  import.meta.env.VITE_AUTH0_AUDIENCE;


// ---------------------------------------------------------
// FAIL EARLY WHEN CONFIGURATION IS MISSING
// ---------------------------------------------------------
//
// A visible configuration error is much easier to diagnose
// than an unexplained Auth0 redirect failure.
//
if (!auth0Domain) {
  throw new Error(
    "VITE_AUTH0_DOMAIN is missing from frontend/.env"
  );
}

if (!auth0ClientId) {
  throw new Error(
    "VITE_AUTH0_CLIENT_ID is missing from frontend/.env"
  );
}

if (!auth0Audience) {
  throw new Error(
    "VITE_AUTH0_AUDIENCE is missing from frontend/.env"
  );
}


// ---------------------------------------------------------
// RENDER THE APPLICATION
// ---------------------------------------------------------
//
// Auth0Provider makes authentication state available to every
// component beneath it through Auth0's useAuth0() hook.
//
createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        // Auth0 sends the user back to this URL after login.
        redirect_uri:
          window.location.origin,

        // Request an access token intended specifically
        // for the HouseIQ Express API.
        audience:
          auth0Audience,

        // Standard OpenID Connect scopes.
        scope:
          "openid profile email",
      }}
    >
      <App />
    </Auth0Provider>
  </StrictMode>
);