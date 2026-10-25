const express = require('express');
const { authenticateToken } = require('./auth');
const security = require('../security');
const remote = require('../remoteControl');
const db = require('../database');

// The PC agent authenticates with its own bearer token, never with a human session.
const agent = express.Router();
agent.use((req, res, next) => {
    if (!remote.agentAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
    res.set('Cache-Control', 'no-store');
    next();
});
agent.get('/poll', (req, res) => {
    remote.poll({ host: req.query.host, version: req.query.v, claude: req.query.claude },
        (body) => { if (!res.writableEnded) res.json(body); },
        (cleanup) => req.on('close', cleanup));
});
agent.post('/report', express.json({ limit: '512kb' }), (req, res) => {
    remote.report(req.body || {});
    res.json({ ok: true });
});
agent.post('/screenshot', express.raw({ type: ['image/jpeg', 'image/png'], limit: '3mb' }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(415).json({ error: 'Expected an image' });
    // Accepted only as the answer to a screenshot job, which names the PC it belongs to.
    if (!remote.screenshot(req.body, req.get('content-type'), req.query.job)) return res.status(404).json({ error: 'Unknown job' });
    res.json({ ok: true });
});

// Outside availability: the agent fetches each public address from the PC's own connection.
agent.get('/probe-targets', (req, res) => res.json({
    targets: require('../externalChecks').probeTargets(db),
    interval_s: 600,
    // Lets the agent notice a monitor whose checks stopped running even though it still answers.
    cycle_at: Number(db.prepare("SELECT value FROM monitor_metadata WHERE key = 'monitor-cycle-at'").get()?.value) || null,
}));
agent.post('/probes', express.json({ limit: '64kb' }), (req, res) => {
    try { res.json(require('../externalChecks').recordProbeRun(db, req.query.host, req.body?.results)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed' }); }
});

// Controlling the PC is owner-only: monitor service sessions and other roles are refused.
const panel = express.Router();
panel.use(authenticateToken, security.owner);
panel.get('/state', (req, res) => res.json(remote.publicState(req.query.pc)));
panel.post('/jobs', (req, res) => {
    try {
        const job = remote.enqueue(String(req.body?.type || ''), req.body?.args, req.body?.pc);
        res.json({ job, agentOnline: remote.agentOnline(job.pc) });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.status ? error.message : 'הפעולה נכשלה.' });
    }
});
panel.get('/jobs/:id', (req, res) => {
    const job = /^[0-9a-f]{16}$/.test(req.params.id) ? remote.getJob(req.params.id) : null;
    return job ? res.json({ job }) : res.status(404).json({ error: 'הפעולה לא נמצאה.' });
});
panel.get('/screenshot', (req, res) => {
    const shot = remote.latestScreenshot(req.query.pc);
    if (!shot) return res.status(404).json({ error: 'אין עדיין צילום מסך.' });
    res.set({ 'Content-Type': shot.type, 'Cache-Control': 'no-store, private' });
    res.send(shot.buf);
});

module.exports = { agent, panel };
