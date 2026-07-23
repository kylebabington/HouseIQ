// frontend/src/api.js

import axios from "axios";


// ---------------------------------------------------------
// API BASE URL
// ---------------------------------------------------------
//
// VITE_API_URL should include the backend's /api prefix.
//
// Local example:
//
// http://localhost:5000/api
//
const API_BASE_URL =
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000/api";


// ---------------------------------------------------------
// SHARED AXIOS INSTANCE
// ---------------------------------------------------------
//
// Every HouseIQ backend request should use this Axios
// instance instead of importing Axios directly.
//
// Axios will combine:
//
// baseURL: http://localhost:5000/api
// request: /homes
//
// into:
//
// http://localhost:5000/api/homes
//
const api = axios.create({
    baseURL: API_BASE_URL,
});


// ---------------------------------------------------------
// ACCESS-TOKEN PROVIDER
// ---------------------------------------------------------
//
// This module is not a React component, so it cannot call:
//
// useAuth0()
//
// App.jsx registers a function here that can retrieve the
// current Auth0 access token.
//
let accessTokenProvider = null;


/**
 * Registers or clears the Auth0 access-token provider.
 *
 * @param {null | (() => Promise<string>)} provider
 */
export function setAccessTokenProvider(
    provider
) {
    accessTokenProvider = provider;
}


// ---------------------------------------------------------
// AUTHENTICATED REQUEST INTERCEPTOR
// ---------------------------------------------------------
//
// Before each request:
//
// 1. Check whether App.jsx registered a token provider.
// 2. Ask Auth0 for a valid access token.
// 3. Add the token to the Authorization header.
// 4. Allow Axios to send the request.
//
api.interceptors.request.use(
    async (config) => {
        if (!accessTokenProvider) {
            return config;
        }

        const accessToken =
            await accessTokenProvider();

        if (!accessToken) {
            return config;
        }

        // Axios normally creates this object, but this fallback
        // makes the code defensive and easier to understand.
        config.headers =
            config.headers || {};

        config.headers.Authorization =
            `Bearer ${accessToken}`;

        return config;
    },

    (error) => {
        return Promise.reject(error);
    }
);


export default api;