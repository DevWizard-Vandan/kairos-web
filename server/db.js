const { Pool } = require('pg');

// Connect to the Postgres Container
const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'kairos_db',
    password: 'password',
    port: 5432,
});

// Create Table if it doesn't exist
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS anchors (
                id UUID PRIMARY KEY,
                text TEXT NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                original_author TEXT
            );
            
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar_color TEXT DEFAULT '#00a884'
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER REFERENCES users(id),
                user2_id INTEGER REFERENCES users(id),
                last_message TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(id),
                sender_id INTEGER REFERENCES users(id),
                text TEXT,
                type TEXT DEFAULT 'text',
                media_url TEXT,
                status TEXT DEFAULT 'sent',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Connected to Postgres (The Rock)');
    } catch (err) {
        console.error('❌ Postgres Error:', err);
    }
};

module.exports = { pool, initDB };