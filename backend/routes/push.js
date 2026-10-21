const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');
const push = require('../push');

const router = express.Router();
router.use(authenticateToken);
router.use((req, res, next) => (req.user.service ? res.status(403).json({ error: 'לחשבון הבדיקה אין התראות.' }) : next()));

router.get('/', (req, res) => {
    const devices = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(req.user.id).n;
    res.json({ publicKey: push.vapidKeys().publicKey, devices });
});

router.post('/subscribe', (req, res) => {
    try {
        push.subscribe(req.user.id, req.body);
        res.json({ ok: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

router.post('/unsubscribe', (req, res) => {
    push.unsubscribe(req.user.id, req.body?.endpoint);
    res.json({ ok: true });
});

router.post('/test', async (req, res) => {
    const result = await push.sendPush({ title: 'Server Monitor', body: 'התראות פועלות במכשיר הזה.', url: '/serve-monitor/infrastructure' }, { userId: req.user.id });
    res.json(result);
});

module.exports = router;
