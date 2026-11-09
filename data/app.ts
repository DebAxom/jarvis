import { Pool } from "pg";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Hash password using scrypt with a random salt
function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");

    return `${salt}:${hash}`;
}

// Hash API key using SHA-256
function hashApiKey(apiKey: string) {
    return createHash("sha256").update(apiKey).digest("hex");
}

// Create application
export async function createApp(
    appid: string,
    name: string,
    password: string,
    apiKey: string
) {
    const result = await pool.query(
        `INSERT INTO apps (appid, name, password, api_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (appid) DO NOTHING
         RETURNING id, appid, name, services`,
        [
            appid,
            name,
            hashPassword(password),
            hashApiKey(apiKey)
        ]
    );

    if (!result.rowCount) {
        throw new Error(`Application '${appid}' already exists`);
    }

    return result.rows[0];
}

// Add a service
export async function addService(appid: string, service: string) {
    const result = await pool.query(
        `UPDATE apps
         SET services = array_append(services, $2)
         WHERE appid = $1
           AND NOT ($2 = ANY(services))
         RETURNING services`,
        [appid, service]
    );

    if (result.rowCount) {
        return result.rows[0].services;
    }

    const existing = await pool.query(
        `SELECT services FROM apps WHERE appid = $1`,
        [appid]
    );

    if (!existing.rowCount) {
        throw new Error(`Application '${appid}' not found`);
    }

    return existing.rows[0].services;
}

// Delete a service
export async function deleteService(appid: string, service: string) {
    const result = await pool.query(
        `UPDATE apps
         SET services = array_remove(services, $2)
         WHERE appid = $1
         RETURNING services`,
        [appid, service]
    );

    if (!result.rowCount) {
        throw new Error(`Application '${appid}' not found`);
    }

    return result.rows[0].services;
}

// Create the initial application
async function setup() {
    try {
        const app = await createApp(
            "todo",
            "Todo",
            "joiaiaxom",
            "x0-w2-r3-se2d-d23e3rc-ww32dfWF-ee"
        );

        console.log("Application created:", app);

        // Example service registration
        await addService("todo", "auth");
        await addService("todo", "tasks");
        await addService("todo", "notifications");

        console.log("Services registered successfully.");

    } catch (error) {
        console.error("Setup failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

if (import.meta.main) {
    // setup();
    // await addService("todo", "app");
    await deleteService("todo", "notifications");
    await deleteService("todo", "auth");
    await deleteService("todo", "tasks");
}
