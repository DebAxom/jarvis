import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function listTables() {
    try {
        const { rows: tables } = await pool.query(`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        `);

        if (!tables.length) {
            console.log("No tables found.");
            return;
        }

        console.log("\n========== DATABASE TABLES ==========\n");

        for (const { tablename } of tables) {
            console.log(`\n📁 ${tablename}`);

            const { rows: columns } = await pool.query(
                `SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = $1
                 ORDER BY ordinal_position`,
                [tablename]
            );

            console.table(columns);

            const { rows: count } = await pool.query(
                `SELECT COUNT(*)::int AS total FROM public.${'"' + tablename + '"' }`
            );

            console.log(`Total rows: ${count[0].total}`);
            console.log("-------------------------------------");
        }
    } catch (error) {
        console.error("Failed to list tables:", error);
    } finally {
        await pool.end();
    }
}

listTables();
