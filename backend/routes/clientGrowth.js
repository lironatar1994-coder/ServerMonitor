const express = require('express');
const { authenticateToken } = require('./auth');
const growth = require('../clientGrowth');
const router = express.Router();
router.use(authenticateToken);
const handle = fn => (req, res) => {
    try { res.json(fn(req)); }
    catch (error) {
        if (error.code?.startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'רשומה כזו כבר קיימת' });
        if (!error.status) console.error('Client growth request failed:', error.message);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'הפעולה נכשלה. אפשר לנסות שוב.' });
    }
};
router.get('/', handle(req => growth.overview(req.query)));
router.get('/:id', handle(req => growth.detail(req.params.id, req.query)));
router.get('/:id/report', handle(req => growth.report(req.params.id, req.query)));
router.put('/:id/profile', handle(req => growth.saveProfile(req.params.id, req.body, req.user.username)));
router.post('/:id/:kind', handle(req => growth.save(req.params.id, req.params.kind, null, req.body, req.user.username)));
router.patch('/:id/:kind/:recordId', handle(req => growth.save(req.params.id, req.params.kind, req.params.recordId, req.body, req.user.username)));
module.exports = router;
