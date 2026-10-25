const express = require('express');
const {
    isAuthorizedSignal,
    recordBrowserSignal,
    recordEngagementSignal,
    recordProductEvent,
    recordWebVitals,
    recordInteraction
} = require('../browserSignals');

const SIGNAL_RECORDERS = {
    growth: require('../growthSignals').recordGrowthSignal,
    engagement: recordEngagementSignal,
    product: recordProductEvent,
    vitals: recordWebVitals,
    interaction: recordInteraction,
    error: require('../jsErrors').recordJsError
};

const router = express.Router();

function collectSignal(req, res, fixedSiteUrl = null) {
    if (!isAuthorizedSignal(req.get('x-visitor-signal-key'))) {
        return res.status(401).json({ error: 'Unauthorized browser signal integration' });
    }
    // Bridges forward the visitor's own cookies: a browser marked internal is never measured.
    if (/(?:^|;\s*)monitor_internal=1(?:;|$)/.test(req.get('cookie') || '')) {
        return res.status(202).json({ accepted: false, internal: true });
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

module.exports = router;
