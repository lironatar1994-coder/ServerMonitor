const crypto = require('crypto');
const db = require('./database');
const { getSignalKey, findSignalApp, normalizeIp, validateSignalBody, getAutomationHint } = require('./browserSignals');
const EVENTS = new Set(['page_view', 'contact_click', 'form_start', 'form_submit', 'form_error', 'form_success_observed']);
const SAFE_TAG = /^[\p{L}\p{N}_. -]{1,80}$/u;
const rate = new Map();
let rateWindow = Date.now();
function boundedRate(appId, address) {
    if (Date.now() - rateWindow >= 60000) { rate.clear(); rateWindow = Date.now(); }
    const key = `${appId}:${address}`;
    if (!rate.has(key) && rate.size >= 10000) throw Object.assign(new Error('Signal capacity exceeded'), { status: 429 });
    const count = (rate.get(key) || 0) + 1;
    rate.set(key, count);
    if (count > 240) throw Object.assign(new Error('Too many signals'), { status: 429 });
}
function campaignTag(value) { return typeof value === 'string' && SAFE_TAG.test(value) ? value : ''; }
function recordGrowthSignal({ body, ip, userAgent, siteUrl }) {
    const signal = validateSignalBody(body);
    const app = findSignalApp(siteUrl);
    const key = getSignalKey();
    const address = normalizeIp(ip);
    if (!app || !key || !address || !EVENTS.has(body.event_type)) {
        throw Object.assign(new Error('Invalid growth signal'), { status: 400 });
    }
    const prefix = new URL(app.url).pathname.replace(/\/$/, '');
    if (prefix && signal.path !== prefix && !signal.path.startsWith(prefix + '/')) {
        throw Object.assign(new Error('Signal path does not belong to website'), { status: 400 });
    }
    const label = ['whatsapp', 'phone', 'email', 'form', 'link'].includes(body.label) ? body.label : '';
    boundedRate(app.id, address);
    const result = db.prepare(`INSERT OR IGNORE INTO growth_events
        (app_id,event_id,occurred_at,session_hash,event_type,path,label,source,medium,campaign,device,automation_hint)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(app.id, signal.eventId, new Date().toISOString(),
        crypto.createHmac('sha256', key).update(`${app.id}:growth:${signal.sessionId}`).digest('hex'),
        body.event_type, signal.path, label, campaignTag(body.source), campaignTag(body.medium), campaignTag(body.campaign),
        ['mobile', 'tablet', 'desktop'].includes(body.device) ? body.device : 'unknown',
        getAutomationHint({ body, ip: address, userAgent, path: signal.path }));
    return { accepted: true, duplicate: result.changes === 0, app: app.name };
}
module.exports = { recordGrowthSignal, campaignTag, EVENTS };
