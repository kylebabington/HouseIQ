// backend/db.js

// pg provides the PostgreSQL-compatible database client.
// CockroachDB supports the PostgreSQL wire protocol, so the
// normal pg Pool class can connect to it.
import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------
// SSL CONFIGURATION
// ---------------------------------------------------------
//
// CockroachDB Cloud requires SSL.
//
// `rejectUnauthorized: false` tolerates local certificate-chain
// quirks during development, but it also disables verification
// that the server certificate is legitimate — this must never be
// used in production. In production we require normal SSL
// certificate verification instead.
const isProduction =
    process.env.NODE_ENV === "production";

const sslConfig = isProduction
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };

// Create one reusable database connection pool.
//
// Application routes should import this shared pool instead of
// creating their own database connections.
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: sslConfig,
});