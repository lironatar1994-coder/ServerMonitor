const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const fs = require('fs');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_monitor_key_123';

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
        token,
        user: { id: user.id, username: user.username }
    });
});

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

router.post('/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'יש להזין סיסמה ישנה וחדשה' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    if (!bcrypt.compareSync(oldPassword, user.password)) {
        return res.status(400).json({ error: 'הסיסמה הנוכחית אינה נכונה' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);

    res.json({ message: 'הסיסמה שונתה בהצלחה!' });
});

router.post('/test-whatsapp', authenticateToken, (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'יש להזין מספר טלפון והודעה' });
    }

    const veeDbPath = '/root/Vee/backend/database.sqlite';
    if (!fs.existsSync(veeDbPath)) {
        return res.status(400).json({ error: 'בסיס הנתונים של Vee לא נמצא בשרת' });
    }

    try {
        const veeDb = new (require('better-sqlite3'))(veeDbPath);
        veeDb.prepare('INSERT INTO whatsapp_outbox (to_phone, message) VALUES (?, ?)').run(phone, message);
        veeDb.close();
        res.json({ message: 'הודעת הבדיקה נשלחה לתור ה-WhatsApp בהצלחה!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: `שגיאה בשליחה לתור: ${e.message}` });
    }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
