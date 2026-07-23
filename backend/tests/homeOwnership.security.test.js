// backend/tests/homeOwnership.security.test.js
//
// Parts 17–19: ownership and auth ordering for home-scoped routes.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";

import {
    getMissingAuth0TestEnv,
    getTestUserTokens,
} from "./helpers/auth0Tokens.js";
import {
    createOwnedHome,
    deleteHomesByIds,
} from "./helpers/setupHomes.js";

const missingAuthEnv = getMissingAuth0TestEnv();
const describeIfConfigured =
    missingAuthEnv.length === 0
        ? describe
        : describe.skip;

describeIfConfigured(
    "home ownership security (Parts 17–19)",
    () => {
        /** @type {import("express").Express} */
        let app;
        /** @type {import("pg").Pool} */
        let pool;

        let userAAccessToken;
        let userBAccessToken;
        let userAHomeId;
        let userBHomeId;
        const runId = randomUUID().slice(0, 8);
        const unauthorizedTitle =
            `Unauthorized test ${runId}`;

        beforeAll(async () => {
            const serverModule =
                await import("../server.js");

            app = serverModule.app;
            pool = serverModule.pool;

            const tokens =
                await getTestUserTokens();

            userAAccessToken =
                tokens.userAAccessToken;
            userBAccessToken =
                tokens.userBAccessToken;

            const homeA =
                await createOwnedHome(
                    app,
                    userAAccessToken,
                    `Security Test Home A ${runId}`
                );

            const homeB =
                await createOwnedHome(
                    app,
                    userBAccessToken,
                    `Security Test Home B ${runId}`
                );

            userAHomeId = homeA.id;
            userBHomeId = homeB.id;
        });

        afterAll(async () => {
            try {
                await deleteHomesByIds(
                    pool,
                    [userAHomeId, userBHomeId]
                );
            } finally {
                if (pool) {
                    await pool.end();
                }
            }
        });

        it("Part 17: valid user + invalid home UUID returns 404 Home not found", async () => {
            const response = await request(app)
                .get(
                    "/api/homes/00000000-0000-0000-0000-000000000001/memories"
                )
                .set(
                    "Authorization",
                    `Bearer ${userAAccessToken}`
                );

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: "Home not found",
            });
        });

        it("smoke: owner can list their own home memories", async () => {
            const response = await request(app)
                .get(
                    `/api/homes/${userAHomeId}/memories`
                )
                .set(
                    "Authorization",
                    `Bearer ${userAAccessToken}`
                );

            expect(response.status).toBe(200);
            expect(
                Array.isArray(response.body)
            ).toBe(true);
        });

        describe("Part 18: User A cannot access User B home", () => {
            const crossUserGetRoutes = [
                "memories",
                "issues",
                "projects",
                "assets",
                "documents",
            ];

            it.each(crossUserGetRoutes)(
                "GET /api/homes/:homeId/%s returns 404",
                async (resource) => {
                    const response =
                        await request(app)
                            .get(
                                `/api/homes/${userBHomeId}/${resource}`
                            )
                            .set(
                                "Authorization",
                                `Bearer ${userAAccessToken}`
                            );

                    expect(
                        response.status
                    ).toBe(404);
                    expect(
                        response.body
                    ).toEqual({
                        error: "Home not found",
                    });
                }
            );

            it("POST memory under User B home returns 404 and creates no row", async () => {
                const response =
                    await request(app)
                        .post(
                            `/api/homes/${userBHomeId}/memories`
                        )
                        .set(
                            "Authorization",
                            `Bearer ${userAAccessToken}`
                        )
                        .send({
                            title: unauthorizedTitle,
                            category:
                                "security-test",
                            content:
                                "This record must not be created.",
                        });

                expect(response.status).toBe(
                    404
                );
                expect(response.body).toEqual({
                    error: "Home not found",
                });

                const dbResult =
                    await pool.query(
                        `
                        SELECT
                            id,
                            home_id,
                            title,
                            content
                        FROM memories
                        WHERE title = $1
                          AND home_id = $2
                        `,
                        [
                            unauthorizedTitle,
                            userBHomeId,
                        ]
                    );

                expect(
                    dbResult.rows
                ).toHaveLength(0);
            });
        });

        it("Part 19: missing Authorization returns 401 before ownership", async () => {
            const response = await request(app).get(
                `/api/homes/${userAHomeId}/memories`
            );

            expect(response.status).toBe(401);
            expect(response.body.error).toBe(
                "Authentication required"
            );
        });
    }
);

if (missingAuthEnv.length > 0) {
    describe("home ownership security (skipped)", () => {
        it(`skips when Auth0 test env is incomplete: ${missingAuthEnv.join(", ")}`, () => {
            expect(missingAuthEnv.length).toBeGreaterThan(
                0
            );
        });
    });
}
