const { Pool } = require('pg');
require('dotenv').config();

// Connect to your Postgres Container
const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'kairos_db',
    password: 'password',
    port: 5432,
});

const createTables = async () => {
    try {
        console.log('⏳ Connecting to The Rock (Postgres)...');

        // 1. Enable UUID extension (so we can generate random IDs)
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        // 2. Create Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                avatar_color VARCHAR(20) DEFAULT '#00d4ff',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created Table: users');

        // 3. Create Conversations Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user1_id UUID REFERENCES users(id),
                user2_id UUID REFERENCES users(id),
                last_message TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user1_id, user2_id)
            );
        `);
        console.log('✅ Created Table: conversations');

        // 4. Create Messages Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID REFERENCES conversations(id),
                sender_id UUID REFERENCES users(id),
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created Table: messages');

        // 5. Create Groups Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                admin_id UUID REFERENCES users(id),
                last_message TEXT,
                avatar_url TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created Table: groups');

        // 6. Create Group Members Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id),
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id)
            );
        `);
        console.log('✅ Created Table: group_members');

        // 7. Create Group Messages Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS group_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
                sender_id UUID REFERENCES users(id),
                text TEXT,
                type VARCHAR(50) DEFAULT 'text',
                media_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Created Table: group_messages');

        console.log('🎉 Database Upgrade Complete!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error setting up database:', err);
        process.exit(1);
    }
};

createTables();
