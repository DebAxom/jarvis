import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const statements = [
    `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

    `CREATE TABLE IF NOT EXISTS apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appid VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password TEXT NOT NULL,
        api_key TEXT NOT NULL UNIQUE,
        services TEXT[] NOT NULL DEFAULT '{}'
    )`,

    `CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appid VARCHAR(255) NOT NULL REFERENCES apps(appid) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        service VARCHAR(255) NOT NULL,
        msg TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        endpoint TEXT,
        trace_id VARCHAR(255),
        metadata JSONB DEFAULT '{}'
    )`,

    `ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'system'`,

    `CREATE TABLE IF NOT EXISTS metrics (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        appid VARCHAR(255) NOT NULL REFERENCES apps(appid) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB NOT NULL
    )`,

    `CREATE INDEX IF NOT EXISTS idx_events_app_time
     ON events (appid, timestamp DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_events_service_time
     ON events (appid, service, timestamp DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_events_trace
     ON events (appid, trace_id)
     WHERE trace_id IS NOT NULL`,

    `CREATE INDEX IF NOT EXISTS idx_metrics_app_time
     ON metrics (appid, timestamp DESC)`
];

async function setup() {
    const client = await pool.connect();

    try {
        console.log("Connected to Neon PostgreSQL.");

        await client.query("BEGIN");

        for (const [index, statement] of statements.entries()) {
            await client.query(statement);
            console.log(`Executed ${index + 1}/${statements.length}`);
        }

        await client.query("COMMIT");

        console.log("Database setup completed successfully!");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Database setup failed:", error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

setup();
