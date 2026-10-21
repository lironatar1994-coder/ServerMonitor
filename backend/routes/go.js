// Public redirect for tracked short links. Nginx forwards `https://<site>/l/<code>` here with
// the site host; the response is a plain redirect and stores no visitor identifiers.
const express = require('express');
const db = require('../database');
const { getBotClassification } = require('../logParser');
const { resolveLink } = require('../sources');

const router = express.Router();
router.get('/:code', (req, res) => {
    const host = req.get('x-link-host');
    const userAgent = req.get('user-agent') || '';
    const automated = getBotClassification({ userAgent, ip: req.get('x-visitor-ip') || '', path: '/', method: 'GET' }).classification !== 'candidate';
    const internal = /(?:^|;\s*)monitor_internal=1(?:;|$)/.test(req.get('cookie') || '');
    const target = resolveLink(db, host, req.params.code, { automated, internal });
    res.set('Cache-Control', 'no-store');
    if (!target) return res.status(404).send('Not found');
    res.redirect(302, target);
});
module.exports = router;
