// frontend/src/api.js

import axios from "axios";


// ---------------------------------------------------------
// API BASE URL
// ---------------------------------------------------------

const API_BASE_URL =
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000/api";


// ---------------------------------------------------------
// SHARED AXIOS INSTANCE
// ---------------------------------------------------------
//
// Every HouseIQ request should use this instance instead
// of importing the default Axios object directly.
//
const api = axios.create({
    baseURL:
        API_BASE_URL,

    headers: {
        "Content-Type":
            "application/json",
    },
});


// ---------------------------------------------------------
// ACCESS-TOKEN PROVIDER
// ---------------------------------------------------------
//
// api.js is not a React component, so it cannot directly use:
//
// useAuth0()
//
// Instead, App.jsx gives this file a function capable of
// retrieving the current Auth0 access token.
//
let accessTokenProvider = null;


/**
 * Registers a function that returns the current access token.
 *
 * App.jsx will supply Auth0's getAccessTokenSilently function.
 */
export function setAccessTokenProvider(
    provider
) {
    accessTokenProvider =
        provider;
}


// ---------------------------------------------------------
// REQUEST INTERCEPTOR
// ---------------------------------------------------------
//
// Before every request:
//
// 1. Ask Auth0 for the current access token.
// 2. Add it to the Authorization header.
// 3. Send the request to Express.
//
api.interceptors.request.use(
    async (config) => {
        if (accessTokenProvider) {
            const token =
                await accessTokenProvider();

            if (token) {
                config.headers.Authorization =
                    `Bearer ${token}`;
            }
        }

        return config;
    },

    (error) => {
        return Promise.reject(error);
    }
);


export default api;