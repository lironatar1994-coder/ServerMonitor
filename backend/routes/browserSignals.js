const express = require('express');
const {
    isAuthorizedSignal,
    recordBrowserSignal,
    recordEngagementSignal,
    recordProductEvent
} = require('../browserSignals');

const SIGNAL_RECORDERS = {
    engagement: recordEngagementSignal,
    product: recordProductEvent
};

const router = express.Router();

function collectSignal(req, res, fixedSiteUrl = null) {
    if (!isAuthorizedSignal(req.get('x-visitor-signal-key'))) {
        return res.status(401).json({ error: 'Unauthorized browser signal integration' });
    }
    try {
        // The Nginx bridge exposes one path, so the payload selects the signal kind.
        const record = SIGNAL_RECORDERS[req.body?.kind] || recordBrowserSignal;
        const result = record({
            body: req.body,
            ip: req.get('x-visitor-ip'),
            userAgent: req.get('x-visitor-user-agent'),
            siteUrl: fixedSiteUrl || req.get('x-visitor-site-url')
        });
        return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
        return res.status(error.status || 500).json({ error: error.message });
    }
}

router.post('/site', (req, res) => collectSignal(req, res));

// Temporary compatibility route for the first Libi deployment. Remove only after
// the storefront has moved to the generic /site endpoint in production.
router.post('/libi', (req, res) => collectSignal(req, res, 'https://www.libidiamonds.co.il/'));

module.exports = router;
