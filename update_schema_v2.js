const { Pool } = require('pg');

// Credentials from server/db.js since .env seems unused or unreliable there
const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'kairos_db',
    password: 'password',
    port: 5432,
});

async function upgrade() {
    try {
        console.log("⏳ Upgrading Users Table...");

        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS avatar_url TEXT,
            ADD COLUMN IF NOT EXISTS bio VARCHAR(150) DEFAULT 'Hey there! I am using Kairos.';
        `);

        console.log("✅ Database Upgraded: Added avatar_url and bio.");
    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        pool.end();
    }
}

upgrade();
