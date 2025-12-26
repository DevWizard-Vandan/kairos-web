const { Pool } = require('pg');
require('dotenv').config({ path: './server/.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function upgrade() {
    try {
        console.log("⏳ Creating Group Tables...");

        // 1. Groups Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                avatar_url TEXT,
                admin_id UUID REFERENCES users(id),
                last_message TEXT DEFAULT 'Group created',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Members Table (Who is in which group)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id)
            );
        `);

        // 3. Group Messages Table (Separate from private messages)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
                sender_id UUID REFERENCES users(id),
                text TEXT,
                type VARCHAR(20) DEFAULT 'text',
                media_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database Upgraded: Groups System Ready.");
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        pool.end();
    }
}

upgrade();
