const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== СЕКРЕТНЫЙ КЛЮЧ =====
const SECRET_KEY = 'ufogalaxy-beto-test-2026-super-secure';

// ===== ШИФРОВАНИЕ =====
function encrypt(text) {
    try {
        const cipher = crypto.createCipher('aes-256-cbc', SECRET_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (e) {
        return text;
    }
}

function decrypt(encryptedText) {
    try {
        const decipher = crypto.createDecipher('aes-256-cbc', SECRET_KEY);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return '[🔐 ЗАШИФРОВАНО]';
    }
}

// ===== ХРАНИЛИЩЕ =====
let users = [];
let messages = [];
let chats = [
    { 
        id: 'general', 
        name: '🌍 Общий чат', 
        createdBy: 'system', 
        type: 'public', 
        isPrivate: false,
        allowedUsers: []
    }
];

// ===== ЗАГРУЗКА ДАННЫХ =====
try {
    const usersData = fs.readFileSync('users.json', 'utf8');
    users = JSON.parse(usersData);
} catch (err) {
    users = [];
}

try {
    const messagesData = fs.readFileSync('chat_history.json', 'utf8');
    messages = JSON.parse(messagesData);
} catch (err) {
    messages = [];
}

try {
    const chatsData = fs.readFileSync('chats.json', 'utf8');
    chats = JSON.parse(chatsData);
} catch (err) {
    chats = [
        { 
            id: 'general', 
            name: '🌍 Общий чат', 
            createdBy: 'system', 
            type: 'public',
            isPrivate: false,
            allowedUsers: []
        }
    ];
}

// ===== СОХРАНЕНИЕ =====
function saveUsers() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

function saveHistory() {
    fs.writeFileSync('chat_history.json', JSON.stringify(messages, null, 2));
}

function saveChats() {
    fs.writeFileSync('chats.json', JSON.stringify(chats, null, 2));
}

// ===== ПАПКА ДЛЯ ФАЙЛОВ =====
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ===== MULTER =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'file-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

// ===== ЗАГРУЗКА ФАЙЛА =====
app.post('/upload-file', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false });
    }
    const fileUrl = '/uploads/' + req.file.filename;
    res.json({
        success: true,
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
    });
});

// ===== РЕГИСТРАЦИЯ =====
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.json({ success: false });
    }
    users.push({ 
        username, 
        password, 
        friends: [], 
        friendRequests: [],
        favoriteChats: [],
        theme: 'dark',
        registeredAt: new Date().toISOString()
    });
    saveUsers();
    res.json({ success: true });
});

// ===== ВХОД =====
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    res.json({ success: !!user });
});

// ===== НАСТРОЙКИ =====
app.get('/user/settings/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    if (!user) return res.json({ theme: 'dark', favoriteChats: [] });
    res.json({
        theme: user.theme || 'dark',
        favoriteChats: user.favoriteChats || []
    });
});

app.post('/user/settings', (req, res) => {
    const { username, theme, favoriteChats } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        if (theme) user.theme = theme;
        if (favoriteChats !== undefined) user.favoriteChats = favoriteChats;
        saveUsers();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ===== ПОЛЬЗОВАТЕЛИ =====
app.get('/users', (req, res) => {
    const { username } = req.query;
    const user = users.find(u => u.username === username);
    if (!user) return res.json([]);
    const usersList = users
        .filter(u => u.username !== username)
        .map(u => ({
            username: u.username,
            isFriend: user.friends?.includes(u.username) || false,
            hasRequest: user.friendRequests?.includes(u.username) || false
        }));
    res.json(usersList);
});

app.get('/user/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    if (!user) return res.json(null);
    res.json({
        username: user.username,
        registeredAt: user.registeredAt,
        friendsCount: user.friends?.length || 0
    });
});

// ===== ДРУЗЬЯ =====
app.post('/friend-request', (req, res) => {
    const { from, to } = req.body;
    const toUser = users.find(u => u.username === to);
    if (!toUser) return res.json({ success: false });
    if (!toUser.friendRequests) toUser.friendRequests = [];
    if (!toUser.friends) toUser.friends = [];
    if (!toUser.friendRequests.includes(from) && !toUser.friends.includes(from)) {
        toUser.friendRequests.push(from);
        saveUsers();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/accept-friend', (req, res) => {
    const { username, friend } = req.body;
    const user = users.find(u => u.username === username);
    const friendUser = users.find(u => u.username === friend);
    if (user && friendUser) {
        if (!user.friends) user.friends = [];
        if (!friendUser.friends) friendUser.friends = [];
        user.friends.push(friend);
        friendUser.friends.push(username);
        user.friendRequests = user.friendRequests.filter(f => f !== friend);
        saveUsers();
        const privateChatId = [username, friend].sort().join('-');
        if (!chats.find(c => c.id === privateChatId)) {
            chats.push({
                id: privateChatId,
                name: `💬 ${username} & ${friend}`,
                type: 'private',
                participants: [username, friend],
                isPrivate: true,
                allowedUsers: [username, friend],
                createdBy: username
            });
            saveChats();
        }
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/reject-friend', (req, res) => {
    const { username, friend } = req.body;
    const user = users.find(u => u.username === username);
    if (user) {
        user.friendRequests = user.friendRequests.filter(f => f !== friend);
        saveUsers();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/remove-friend', (req, res) => {
    const { username, friend } = req.body;
    const user = users.find(u => u.username === username);
    const friendUser = users.find(u => u.username === friend);
    if (user && friendUser) {
        user.friends = user.friends.filter(f => f !== friend);
        friendUser.friends = friendUser.friends.filter(f => f !== username);
        saveUsers();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get('/friend-requests/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    res.json(user?.friendRequests || []);
});

app.get('/friends/:username', (req, res) => {
    const user = users.find(u => u.username === req.params.username);
    const friends = user?.friends || [];
    res.json(friends.map(f => ({ username: f })));
});

// ===== ЧАТЫ =====
app.get('/chats/:username', (req, res) => {
    const username = req.params.username;
    const user = users.find(u => u.username === username);
    const favoriteChats = user?.favoriteChats || [];
    const userChats = chats.filter(chat => {
        if (chat.id === 'general') return true;
        if (chat.type === 'public' && !chat.isPrivate) return true;
        if (chat.isPrivate && chat.allowedUsers?.includes(username)) return true;
        if (chat.type === 'private' && chat.participants?.includes(username)) return true;
        if (chat.createdBy === username) return true;
        return false;
    }).map(chat => ({
        ...chat,
        isFavorite: favoriteChats.includes(chat.id)
    }));
    res.json(userChats);
});

app.post('/chats', (req, res) => {
    const { name, username, type, isPrivate } = req.body;
    const id = type === 'channel' ? 'channel-' + Date.now() : 'chat-' + Date.now();
    const newChat = { 
        id, 
        name, 
        createdBy: username, 
        type: type || 'public',
        createdAt: new Date().toISOString(),
        isPrivate: isPrivate || false,
        allowedUsers: isPrivate ? [username] : [],
        participants: type === 'private' ? [username] : []
    };
    chats.push(newChat);
    saveChats();
    res.json(newChat);
});

app.delete('/chats/:chatId', (req, res) => {
    const { chatId } = req.params;
    const { username } = req.body;
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
        const chat = chats[chatIndex];
        if (chat.createdBy === username || username === 'system') {
            chats.splice(chatIndex, 1);
            saveChats();
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'not_owner' });
        }
    } else {
        res.json({ success: false, error: 'not_found' });
    }
});

// ===== ИСТОРИЯ =====
app.get('/history/:chatId', (req, res) => {
    const chatMessages = messages
        .filter(m => m.chatId === req.params.chatId)
        .map(m => ({
            ...m,
            text: m.text ? decrypt(m.text) : ''
        }));
    res.json(chatMessages);
});

app.get('/user/messages/count/:username', (req, res) => {
    const count = messages.filter(m => m.username === req.params.username).length;
    res.json({ count });
});

// ===== РЕДАКТИРОВАНИЕ СООБЩЕНИЯ =====
app.post('/edit-message', (req, res) => {
    const { messageId, newText, username } = req.body;
    const message = messages.find(m => m.id == messageId);
    
    if (message && message.username === username) {
        // Шифруем новый текст
        message.text = encrypt(newText);
        message.edited = true;
        message.editedAt = new Date().toISOString();
        saveHistory();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ===== УДАЛЕНИЕ СООБЩЕНИЯ =====
app.post('/delete-message', (req, res) => {
    const { messageId, username } = req.body;
    const index = messages.findIndex(m => m.id == messageId);
    
    if (index !== -1 && messages[index].username === username) {
        messages.splice(index, 1);
        saveHistory();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    console.log('👤 Пользователь подключился');
    
    socket.on('join chat', (chatId) => {
        socket.join(chatId);
    });
    
    socket.on('chat message', (data) => {
        const encryptedText = data.text ? encrypt(data.text) : '';
        
        const messageData = {
            ...data,
            text: encryptedText,
            time: new Date().toISOString(),
            id: Date.now() + Math.random(),
            replyTo: data.replyTo || null,
            edited: false
        };
        
        messages.push(messageData);
        saveHistory();
        
        // Отправляем всем расшифрованное сообщение
        io.to(data.chatId).emit('chat message', {
            ...messageData,
            text: data.text
        });
    });
    
    socket.on('disconnect', () => {
        console.log('👤 Пользователь отключился');
    });
});

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================`);
    console.log(`🚀 UFOGALAXY ЗАПУЩЕН!`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`=================================`);
    console.log(`🔐 ШИФРОВАНИЕ: ✅`);
    console.log(`🎤 ГОЛОС: ✅`);
    console.log(`✏️ РЕДАКТИРОВАНИЕ: ✅`);
    console.log(`🗑️ УДАЛЕНИЕ: ✅`);
    console.log(`📎 ФАЙЛЫ: ✅ 50MB`);
    console.log(`=================================\n`);
});
