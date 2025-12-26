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
global.socketToUser = new Map();

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
        let result;
        if (!query || query.trim() === '') {
            result = await pool.query("SELECT id, username, avatar_url, bio FROM users ORDER BY username ASC LIMIT 20");
        } else {
            result = await pool.query("SELECT id, username, avatar_url, bio FROM users WHERE username ILIKE $1 LIMIT 20", [`%${query}%`]);
        }
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

// --- GROUP ROUTES ---

// 1. Create Group
app.post('/api/groups', async (req, res) => {
    try {
        const { name, userIds, adminId } = req.body; // userIds is array of member IDs

        // Create Group
        const groupRes = await pool.query(
            'INSERT INTO groups (name, admin_id) VALUES ($1, $2) RETURNING *',
            [name, adminId]
        );
        const groupId = groupRes.rows[0].id;

        // Add Members (Admin + Selected Users)
        const members = [adminId, ...userIds];
        for (const uid of members) {
            await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [groupId, uid]);
        }

        res.json(groupRes.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Group creation failed" });
    }
});

// 1b. Add Member to Group
app.post('/api/groups/:groupId/members', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userIds } = req.body; // Array of user IDs

        for (const uid of userIds) {
            // Check if already exists to avoid errors (or use ON CONFLICT DO NOTHING)
            await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, uid]);

            // Notify User to Join Room
            const io = req.app.get('io');
            const socketId = onlineUsers.get(uid);
            if (socketId && io) {
                io.to(socketId).emit('added_to_group', { groupId, name: 'New Group' });
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add members" });
    }
});

// 1c. Get Group Members
app.get('/api/groups/:groupId/members', async (req, res) => {
    try {
        const { groupId } = req.params;
        const result = await pool.query(`
            SELECT u.id, u.username, u.avatar_url, u.bio 
            FROM group_members gm 
            JOIN users u ON gm.user_id = u.id 
            WHERE gm.group_id = $1
        `, [groupId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "Failed to fetch members" }); }
});

app.post('/api/groups/:groupId/notify', async (req, res) => {
    // Internal helper or client triggered to notify users to join room
    // Ideally this is part of the add-member route, let's fix that route directly.
});

// 2. Get My Groups
app.get('/api/groups/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(`
            SELECT g.* FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = $1
            ORDER BY g.updated_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Get Group Messages
app.get('/api/groups/:groupId/messages', async (req, res) => {
    try {
        const { groupId } = req.params;
        // Fetch messages with sender info
        const result = await pool.query(`
            SELECT m.*, u.username as sender_name, u.avatar_url as sender_avatar
            FROM group_messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.group_id = $1
            ORDER BY m.created_at ASC
        `, [groupId]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
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

    // Make io accessible to routes
    app.set('io', io);

    io.on('connection', async (socket) => {
        // 1. LOGIN & STATUS UPDATE
        socket.on('login', async (userData) => {
            // Support both old (string id) and new (object) formats
            const userId = typeof userData === 'object' ? userData.id : userData;
            const username = typeof userData === 'object' ? userData.username : 'Unknown';

            onlineUsers.set(userId, socket.id);
            if (global.socketToUser) global.socketToUser.set(socket.id, { id: userId, username });

            // Broadcast to EVERYONE that this user is online
            io.emit('user_status', { userId, status: 'online' });

            // Send list of currently online users to the new person
            const onlineIds = Array.from(onlineUsers.keys());
            socket.emit('online_users', onlineIds);

            // Auto-join groups
            try {
                const groups = await pool.query('SELECT group_id FROM group_members WHERE user_id = $1', [userId]);
                groups.rows.forEach(row => socket.join(row.group_id));
            } catch (err) {
                console.error("Auto-join groups error:", err);
            }
        });

        // 2. TYPING INDICATOR
        socket.on('typing', (data) => {
            const { to, from, isGroup, groupId } = data;
            if (isGroup) {
                // Broadcast to group room (exclude sender)
                socket.to(groupId).emit('display_typing', { from, isGroup: true, groupId });
            } else {
                // Send to specific user
                const socketId = onlineUsers.get(to);
                if (socketId) io.to(socketId).emit('display_typing', { from, isGroup: false });
            }
        });

        socket.on('stop_typing', (data) => {
            const { to, isGroup, groupId } = data;
            if (isGroup) {
                socket.to(groupId).emit('hide_typing', { from: data.from, groupId });
            } else {
                const socketId = onlineUsers.get(to);
                if (socketId) io.to(socketId).emit('hide_typing', { from: data.from });
            }
        });

        // 3. DISCONNECT
        socket.on('disconnect', () => {
            // Find userId by socketId
            let userIdToRemove = null;
            for (const [uid, sid] of onlineUsers.entries()) {
                if (sid === socket.id) {
                    userIdToRemove = uid;
                    break;
                }
            }
            if (userIdToRemove) {
                onlineUsers.delete(userIdToRemove);
                io.emit('user_status', { userId: userIdToRemove, status: 'offline' });
            }
        });

        // ... (Private/Group Messages remain same) ...

        // --- GROUP VIDEO SIGNALING (Updated for Names) ---
        // 1. User joins a voice/video room
        socket.on("join_room", (roomId) => {
            socket.join(roomId);
            // Get all other users in this room
            const roomSet = io.sockets.adapter.rooms.get(roomId) || new Set();
            const usersInRoom = [];
            roomSet.forEach(sid => {
                if (sid !== socket.id) {
                    const info = global.socketToUser ? global.socketToUser.get(sid) : { username: 'Unknown' };
                    usersInRoom.push({ socketId: sid, info });
                }
            });
            socket.emit("all_users", usersInRoom);
        });

        // 2. Existing user sends signal to new user
        socket.on("sending_signal", payload => {
            const callerInfo = global.socketToUser ? global.socketToUser.get(payload.callerID) : { username: 'Unknown' };
            io.to(payload.userToSignal).emit('user_joined', {
                signal: payload.signal,
                callerID: payload.callerID,
                info: callerInfo
            });
        });

        // 2. PRIVATE MESSAGES (Existing Logic)
        socket.on('private_message', async (data) => {
            try {
                const { to, from, text, type, mediaUrl } = data;
                let convRes = await pool.query(`SELECT id FROM conversations WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)`, [from, to]);
                let convId = convRes.rows.length ? convRes.rows[0].id : (await pool.query(`INSERT INTO conversations (user1_id, user2_id, last_message) VALUES ($1, $2, 'Start of chat') RETURNING id`, [from, to])).rows[0].id;

                const msgRes = await pool.query(
                    `INSERT INTO messages (conversation_id, sender_id, text, type, media_url, status) VALUES ($1, $2, $3, $4, $5, 'sent') RETURNING id, created_at`,
                    [convId, from, text || '', type || 'text', mediaUrl || null]
                );

                let preview = type === 'audio' ? '🎤 Voice' : (type === 'image' ? '📷 Image' : text);
                await pool.query(`UPDATE conversations SET last_message = $1, updated_at = NOW() WHERE id = $2`, [preview, convId]);

                const fullMsg = { ...data, id: msgRes.rows[0].id, status: 'sent', timestamp: msgRes.rows[0].created_at };

                const recipientSocket = onlineUsers.get(to);
                if (recipientSocket) io.to(recipientSocket).emit('private_message', fullMsg);
                socket.emit('message_sent', fullMsg);
            } catch (err) { console.error(err); }
        });

        // 3. GROUP MESSAGES (New Logic)
        socket.on('group_message', async (data) => {
            console.log("Received group_message:", data);
            try {
                const { groupId, from, text, type, mediaUrl } = data;

                // Save to DB
                const msgRes = await pool.query(
                    `INSERT INTO group_messages (group_id, sender_id, text, type, media_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
                    [groupId, from, text || '', type || 'text', mediaUrl || null]
                );

                // Update Group Sidebar Preview
                let preview = type === 'audio' ? '🎤 Voice' : (type === 'image' ? '📷 Image' : text);
                // Need to fetch sender name for the preview: "Alice: Hello"
                const senderRes = await pool.query('SELECT username, avatar_url FROM users WHERE id = $1', [from]);
                const senderName = senderRes.rows[0].username;

                await pool.query(`UPDATE groups SET last_message = $1, updated_at = NOW() WHERE id = $2`, [`${senderName}: ${preview}`, groupId]);

                const fullMsg = {
                    ...data,
                    id: msgRes.rows[0].id,
                    timestamp: msgRes.rows[0].created_at,
                    sender_name: senderName,
                    sender_avatar: senderRes.rows[0].avatar_url
                };

                // BROADCAST TO ROOM (Everyone in the group gets this)
                console.log(`Broadcasting to room ${groupId}`, fullMsg);
                io.to(groupId).emit('group_message', fullMsg);

            } catch (err) { console.error("Group Msg Error:", err); }
        });

        // 4. JOIN NEW GROUP (Real-time update)
        socket.on('join_group', (groupId) => {
            socket.join(groupId);
        });

        // Video Signaling (Keep existing)
        socket.on('call_user', (data) => {
            const socketId = onlineUsers.get(data.userToCall);
            if (socketId) io.to(socketId).emit('call_incoming', { signal: data.signalData, from: data.from });
        });
        socket.on('answer_call', (data) => {
            const socketId = onlineUsers.get(data.to);
            if (socketId) io.to(socketId).emit('call_accepted', data.signal);
        });



        // 3. New user returns signal to existing user
        socket.on("returning_signal", payload => {
            io.to(payload.callerID).emit('receiving_returned_signal', { signal: payload.signal, id: socket.id });
        });

        // 4. Leave room
        socket.on('leave_room', (roomId) => {
            socket.leave(roomId);
            socket.to(roomId).emit('user_left', socket.id);
        });

        // 5. Handle Disconnect (Tab Close/Refresh)
        socket.on('disconnecting', () => {
            socket.rooms.forEach(room => {
                socket.to(room).emit('user_left', socket.id);
            });

            if (global.socketToUser) global.socketToUser.delete(socket.id);
        });
    });

    server.listen(3000, () => {
        console.log(`🚀 Server running on port 3000`);
        console.log(`📂 Serving uploads from: ${UPLOAD_DIR}`);
    });
}
startServer();