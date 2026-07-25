// backend/db.js

// pg provides the PostgreSQL-compatible database client.
// CockroachDB supports the PostgreSQL wire protocol, so the
// normal pg Pool class can connect to it.
import pg from "pg";

const { Pool } = pg;

// Create one reusable database connection pool.
//
// Application routes should import this shared pool instead of
// creating their own database connections.
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        // CockroachDB Cloud requires SSL.
        //
        // This setting allows the current CockroachDB Cloud
        // certificate configuration used by HouseIQ.
        rejectUnauthorized: false,
    },
});