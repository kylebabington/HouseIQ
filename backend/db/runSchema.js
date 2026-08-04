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

// CockroachDB Cloud commonly uses SSL.
//
// `rejectUnauthorized: false` keeps the pg client from rejecting
// the connection because of local certificate-chain quirks during
// development, but it must never be used in production. In
// production we require normal SSL certificate verification.
const isProduction =
    process.env.NODE_ENV === "production";

const sslConfig = isProduction
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: sslConfig,
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
