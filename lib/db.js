import { createClient } from '@libsql/client';

let client = null;
let initialized = false;

export function getDb() {
    if (!client) {
        client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN
        });
    }
    return client;
}

export async function ensureSchema() {
    if (initialized) return;
    const db = getDb();
    await db.execute(`
        CREATE TABLE IF NOT EXISTS portfolio (
            ticker TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
    initialized = true;
}
