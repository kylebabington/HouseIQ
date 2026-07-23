// backend/tests/helpers/auth0Tokens.js
//
// Fetches real Auth0 access tokens for User A and User B via the
// Resource Owner Password grant. Tokens are cached for the suite.

import "dotenv/config";

const REQUIRED_ENV = [
    "AUTH0_DOMAIN",
    "AUTH0_AUDIENCE",
    "AUTH0_TEST_CLIENT_ID",
    "AUTH0_TEST_CLIENT_SECRET",
    "AUTH0_TEST_USER_A_USERNAME",
    "AUTH0_TEST_USER_A_PASSWORD",
    "AUTH0_TEST_USER_B_USERNAME",
    "AUTH0_TEST_USER_B_PASSWORD",
];

let cachedTokens = null;

export function getMissingAuth0TestEnv() {
    return REQUIRED_ENV.filter(
        (name) => !process.env[name]
    );
}

async function fetchPasswordGrantToken({
    username,
    password,
}) {
    const domain = process.env.AUTH0_DOMAIN;
    const response = await fetch(
        `https://${domain}/oauth/token`,
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/json",
            },
            body: JSON.stringify({
                grant_type: "password",
                username,
                password,
                client_id:
                    process.env
                        .AUTH0_TEST_CLIENT_ID,
                client_secret:
                    process.env
                        .AUTH0_TEST_CLIENT_SECRET,
                audience:
                    process.env.AUTH0_AUDIENCE,
                scope: "openid",
            }),
        }
    );

    const body = await response.json();

    if (!response.ok) {
        const detail =
            body.error_description ||
            body.error ||
            JSON.stringify(body);

        throw new Error(
            `Auth0 token request failed for ${username}: ${detail}`
        );
    }

    if (!body.access_token) {
        throw new Error(
            `Auth0 token response missing access_token for ${username}`
        );
    }

    return body.access_token;
}

export async function getTestUserTokens() {
    if (cachedTokens) {
        return cachedTokens;
    }

    const missing = getMissingAuth0TestEnv();

    if (missing.length > 0) {
        throw new Error(
            `Missing Auth0 test env vars: ${missing.join(", ")}`
        );
    }

    const [userAAccessToken, userBAccessToken] =
        await Promise.all([
            fetchPasswordGrantToken({
                username:
                    process.env
                        .AUTH0_TEST_USER_A_USERNAME,
                password:
                    process.env
                        .AUTH0_TEST_USER_A_PASSWORD,
            }),
            fetchPasswordGrantToken({
                username:
                    process.env
                        .AUTH0_TEST_USER_B_USERNAME,
                password:
                    process.env
                        .AUTH0_TEST_USER_B_PASSWORD,
            }),
        ]);

    cachedTokens = {
        userAAccessToken,
        userBAccessToken,
    };

    return cachedTokens;
}
