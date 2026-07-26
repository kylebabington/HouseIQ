// backend/db/runSchema.js

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(
    fileURLToPath(import.meta.url)
);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    // CockroachDB Cloud commonly uses SSL.
    // This keeps the pg client from rejecting the connection
    // because of local certificate-chain quirks during development.
    ssl: {
        rejectUnauthorized: false,
    },
});

async function runSchema() {
    try {
        console.log("Reading schema.sql...");

        const schemaSql = fs.readFileSync(
            path.join(__dirname, "schema.sql"),
            "utf8"
        );

        console.log("Connecting to CockroachDB Cloud...");
        console.log("Running schema...");

        await pool.query(schemaSql);

        console.log("Schema created successfully.");
    } catch (error) {
        console.error("Failed to run schema:");
        console.error(error);
    } finally {
        await pool.end();
    }
}

runSchema();
