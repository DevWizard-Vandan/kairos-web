const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'kairos_db',
    password: 'password',
    port: 5432,
});

const upgradeTables = async () => {
    try {
        console.log('⏳ Connecting to Database for Upgrade...');

        // 1. UPGRADE USERS
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status_message VARCHAR(100) DEFAULT 'Hey there! I am using Kairos.';`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW();`);
        console.log('✅ Upgraded Table: users');

        // 2. UPGRADE MESSAGES
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'text';`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INT;`);
        await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';`);
        console.log('✅ Upgraded Table: messages');

        // 3. NEW TABLE: REACTIONS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id UUID REFERENCES messages(id),
                user_id UUID REFERENCES users(id),
                emoji VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(message_id, user_id)
            );
        `);
        console.log('✅ Created Table: reactions');

        console.log('🎉 Database Schema Upgrade Complete!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error upgrading database:', err);
        process.exit(1);
    }
};

upgradeTables();
