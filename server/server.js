const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const cors = require('cors');
const { pool } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const path = require('path');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// 1. ALLOW FRONTEND CONNECTION
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. DEFINE UPLOAD PATHS (Absolute Paths to prevent confusion)
const UPLOAD_DIR = path.join(__dirname, 'public/uploads');

// Ensure folder exists immediately on startup
if (!fs.existsSync(UPLOAD_DIR)) {
    console.log(`Creating upload directory at: ${UPLOAD_DIR}`);
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 3. SERVE FILES (Crucial: This lets the browser see the images)
app.use('/uploads', express.static(UPLOAD_DIR));

// 4. STORAGE ENGINE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
});
const upload = multer({ storage });

const redisClient = createClient({ socket: { host: '127.0.0.1', port: 6379 } });
redisClient.on('error', (err) => console.log('Redis Error', err));
const onlineUsers = new Map();

// --- API ROUTES ---

// Auth
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = await pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username', [username, hashedPassword]);
        res.json({ user: result.rows[0], token: jwt.sign({ id: result.rows[0].id }, 'secret') });
    } catch (err) { res.status(400).json({ error: 'Username taken' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT id, username, password, avatar_url, bio FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        if (!await bcrypt.compare(password, result.rows[0].password)) return res.status(401).json({ error: 'Invalid password' });
        res.json({
            user: {
                id: result.rows[0].id,
                username: result.rows[0].username,
                avatar_url: result.rows[0].avatar_url,
                bio: result.rows[0].bio
            },
            token: jwt.sign({ id: result.rows[0].id }, 'secret')
        });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Search
app.get('/api/users/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);
        const result = await pool.query("SELECT id, username, avatar_url, bio FROM users WHERE username ILIKE $1 LIMIT 10", [`%${query}%`]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload
// SMART UPLOAD HANDLER
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Detect file type based on MIME
    let type = 'file'; // Default to generic file (PDF, Doc, Zip)
    const mime = req.file.mimetype;

    if (mime.startsWith('image/')) type = 'image';
    else if (mime.startsWith('audio/')) type = 'audio';
    else if (mime.startsWith('video/')) type = 'video';

    const browserPath = `/uploads/${req.file.filename}`;
    console.log(`File uploaded: ${browserPath} (${type})`);

    res.json({
        url: browserPath,
        type: type,
        originalName: req.file.originalname
    });
});

// Conversations
app.get('/api/conversations/:userId', async (req, res) => {
    const { userId } = req.params;
    const result = await pool.query(`
        SELECT DISTINCT ON (c.updated_at)
            c.id as conversation_id, u.id as other_user_id, u.username, u.avatar_url, c.last_message, c.updated_at
        FROM conversations c
        JOIN users u ON (u.id = c.user1_id OR u.id = c.user2_id)
        WHERE (c.user1_id = $1 OR c.user2_id = $1) AND u.id != $1
        ORDER BY c.updated_at DESC
    `, [userId]);
    res.json(result.rows);
});

// Get History
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const convRes = await pool.query(
            `SELECT id FROM conversations WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)`,
            [user1, user2]
        );
        if (convRes.rows.length === 0) return res.json([]);

        // Fetch messages AND explicitly select media_url
        const messages = await pool.query(
            `SELECT id, sender_id, text, type, media_url, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [convRes.rows[0].id]
        );
        res.json(messages.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// UPDATE PROFILE
app.put('/api/users/profile', async (req, res) => {
    try {
        const { userId, bio, avatarUrl } = req.body;
        // Simple validation could go here
        const result = await pool.query(
            'UPDATE users SET bio = COALESCE($1, bio), avatar_url = COALESCE($2, avatar_url) WHERE id = $3 RETURNING id, username, bio, avatar_url',
            [bio, avatarUrl, userId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

// --- SOCKET LOGIC ---
async function startServer() {
    await redisClient.connect();

    // Initialize Socket.io with updated config
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:5173",
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        socket.on('login', (userId) => {
            onlineUsers.set(userId, socket.id);
        });

        socket.on('private_message', async (data) => {
            try {
                const { to, from, text, type, mediaUrl } = data;

                let convRes = await pool.query(`SELECT id FROM conversations WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)`, [from, to]);
                let convId = convRes.rows.length ? convRes.rows[0].id : (await pool.query(`INSERT INTO conversations (user1_id, user2_id, last_message) VALUES ($1, $2, 'Start of chat') RETURNING id`, [from, to])).rows[0].id;

                // SAVE to DB
                const msgRes = await pool.query(
                    `INSERT INTO messages (conversation_id, sender_id, text, type, media_url, status) 
                     VALUES ($1, $2, $3, $4, $5, 'sent') RETURNING id, created_at`,
                    [convId, from, text || '', type || 'text', mediaUrl || null]
                );

                // Update Sidebar
                let preview = type === 'audio' ? '🎤 Voice Message' : (type === 'image' ? '📷 Image' : text);
                await pool.query(`UPDATE conversations SET last_message = $1, updated_at = NOW() WHERE id = $2`, [preview, convId]);

                const fullMsg = { ...data, id: msgRes.rows[0].id, status: 'sent', timestamp: msgRes.rows[0].created_at };

                const recipientSocket = onlineUsers.get(to);
                if (recipientSocket) {
                    io.to(recipientSocket).emit('private_message', fullMsg);
                }
                socket.emit('message_sent', fullMsg);

            } catch (err) {
                console.error("Socket Error:", err);
            }
        });

        // 1. INITIATE CALL
        socket.on('call_user', (data) => {
            const { userToCall, signalData, from } = data;
            const socketId = onlineUsers.get(userToCall);
            if (socketId) {
                io.to(socketId).emit('call_incoming', {
                    signal: signalData,
                    from
                });
            }
        });

        // 2. ANSWER CALL
        socket.on('answer_call', (data) => {
            const { to, signal } = data;
            const socketId = onlineUsers.get(to);
            if (socketId) {
                io.to(socketId).emit('call_accepted', signal);
            }
        });
    });

    server.listen(3000, () => {
        console.log(`🚀 Server running on port 3000`);
        console.log(`📂 Serving uploads from: ${UPLOAD_DIR}`);
    });
}
startServer();