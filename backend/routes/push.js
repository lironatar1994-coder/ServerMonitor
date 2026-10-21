const express = require('express');
const db = require('../database');
const { authenticateToken } = require('./auth');
const push = require('../push');

const router = express.Router();
router.use(authenticateToken);
router.use((req, res, next) => (req.user.service ? res.status(403).json({ error: 'לחשבון הבדיקה אין התראות.' }) : next()));

const fail = (res, error) => res.status(error.status || 500).json({ error: error.message });

// `endpoint` identifies this device's subscription so its own preferences come back.
router.get('/', (req, res) => {
    const devices = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(req.user.id).n;
    res.json({ publicKey: push.vapidKeys().publicKey, devices, categories: push.CATEGORIES,
        preferences: req.query.endpoint ? push.preferences(req.user.id, req.query.endpoint) : null });
});

router.post('/subscribe', (req, res) => {
    try {
        push.subscribe(req.user.id, req.body);
        res.json({ ok: true, preferences: push.preferences(req.user.id, req.body?.endpoint) });
    } catch (error) { fail(res, error); }
});

router.put('/preferences', (req, res) => {
    try {
        push.savePreferences(req.user.id, req.body);
        res.json({ ok: true, preferences: push.preferences(req.user.id, req.body?.endpoint) });
    } catch (error) { fail(res, error); }
});

router.post('/unsubscribe', (req, res) => {
    push.unsubscribe(req.user.id, req.body?.endpoint);
    res.json({ ok: true });
});

router.post('/test', async (req, res) => {
    const result = await push.sendPush({ title: 'Server Monitor', body: 'התראות פועלות במכשיר הזה.', url: '/serve-monitor/infrastructure' },
        { userId: req.user.id, test: true });
    res.json(result);
});

// Recent insights, newest first, for the in-app list.
router.get('/insights', (req, res) => {
    res.json({ insights: db.prepare('SELECT key, category, app_id, title, body, url, created_at FROM insight_notifications ORDER BY created_at DESC LIMIT 30').all() });
});

module.exports = router;
