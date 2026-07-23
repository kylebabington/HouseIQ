// backend/tests/helpers/setupHomes.js

import request from "supertest";

export async function createOwnedHome(
    app,
    accessToken,
    name
) {
    const response = await request(app)
        .post("/api/homes")
        .set(
            "Authorization",
            `Bearer ${accessToken}`
        )
        .send({
            name,
            notes: "security-test home",
        });

    if (response.status !== 201) {
        throw new Error(
            `Failed to create home "${name}": ${response.status} ${JSON.stringify(response.body)}`
        );
    }

    return response.body;
}

export async function deleteHomesByIds(
    pool,
    homeIds
) {
    const ids = homeIds.filter(Boolean);

    if (ids.length === 0) {
        return;
    }

    await pool.query(
        `
        DELETE FROM homes
        WHERE id = ANY($1::uuid[])
        `,
        [ids]
    );
}
