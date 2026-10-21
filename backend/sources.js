// How visitors arrived: channels from campaign tags or the referring site, and tracked short
// links (`https://<site>/l/<code>`) that redirect to the site with campaign tags. Clicks keep
// no IP address or identifiers; automation and internal browsers are not counted.
const crypto = require('crypto');

const CHANNELS = {
    google: 'גוגל', bing: 'Bing', search: 'מנועי חיפוש אחרים', google_business: 'פרופיל העסק בגוגל',
    facebook: 'פייסבוק', instagram: 'אינסטגרם', whatsapp: 'וואטסאפ', tiktok: 'טיקטוק', youtube: 'יוטיוב',
    linkedin: 'לינקדאין', x: 'X (טוויטר)', telegram: 'טלגרם', email: 'דוא״ל', sms: 'SMS', qr: 'קוד QR',
    ai: 'צ׳אטבוטים (ChatGPT ועוד)', referral: 'אתרים אחרים', direct: 'ישיר / לא ידוע', other: 'אחר'
};
// Channels a tracked link can be published on.
const LINK_CHANNELS = ['whatsapp', 'facebook', 'instagram', 'tiktok', 'google_business', 'email', 'sms', 'qr', 'linkedin', 'youtube', 'telegram', 'other'];

const RULES = [
    [/^(?:google_business|gbp|google-business|gmb)$/, 'google_business'],
    [/(?:^|\.)google\.[a-z.]+$|^google$/, 'google'],
    [/(?:^|\.)bing\.com$|^bing$/, 'bing'],
    [/duckduckgo|yahoo|yandex|ecosia|baidu|search\.brave/, 'search'],
    [/^(?:fb|facebook)$|(?:^|\.)facebook\.com$|^fb\.me$/, 'facebook'],
    [/^(?:ig|instagram)$|(?:^|\.)instagram\.com$/, 'instagram'],
    [/^(?:wa|whatsapp)$|whatsapp\.com$|^wa\.me$/, 'whatsapp'],
    [/tiktok/, 'tiktok'],
    [/youtube|^youtu\.be$/, 'youtube'],
    [/linkedin|^lnkd\.in$/, 'linkedin'],
    [/^(?:x|twitter)$|^t\.co$|(?:^|\.)(?:twitter|x)\.com$/, 'x'],
    [/telegram|^t\.me$/, 'telegram'],
    [/^(?:email|newsletter|mail)$|mail\.google\.com|outlook\.|mail\.yahoo/, 'email'],
    [/^sms$/, 'sms'],
    [/^qr$/, 'qr'],
    [/chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai/, 'ai']
];

/** Channel id from a campaign source (utm_source) or referring host, plus the medium. */
function channelOf(source, medium = '') {
    const value = String(source || '').trim().toLowerCase();
    const how = String(medium || '').trim().toLowerCase();
    if (how === 'email') return 'email';
    if (how === 'sms') return 'sms';
    if (how === 'qr') return 'qr';
    if (!value) return 'direct';
    const rule = RULES.find(([pattern]) => pattern.test(value));
    if (rule) return rule[1];
    return /\./.test(value) ? 'referral' : 'other';
}

/** Sessions per channel and campaign, with how many of them clicked to make contact. */
function sourcesSummary(db, appId, from, to) {
    const sessions = db.prepare(`SELECT session_hash, source, medium, campaign,
            MAX(CASE WHEN event_type = 'contact_click' THEN 1 ELSE 0 END) AS contacted
        FROM growth_events WHERE app_id = ? AND automation_hint = 0 AND occurred_at >= ? AND occurred_at < ?
        GROUP BY session_hash`).all(appId, from, to);
    const channels = new Map(), campaigns = new Map(), referrals = new Map();
    for (const row of sessions) {
        const channel = channelOf(row.source, row.medium);
        const item = channels.get(channel) || { channel, label: CHANNELS[channel], sessions: 0, contacts: 0 };
        item.sessions++; item.contacts += row.contacted;
        channels.set(channel, item);
        if (row.campaign) {
            const key = `${channel}:${row.campaign}`;
            const camp = campaigns.get(key) || { campaign: row.campaign, channel, label: CHANNELS[channel], sessions: 0, contacts: 0 };
            camp.sessions++; camp.contacts += row.contacted;
            campaigns.set(key, camp);
        }
        if (channel === 'referral') referrals.set(row.source, (referrals.get(row.source) || 0) + 1);
    }
    const sort = (items) => [...items].sort((a, b) => b.sessions - a.sessions);
    return {
        sessions: sessions.length,
        channels: sort(channels.values()),
        campaigns: sort(campaigns.values()).slice(0, 20),
        referrals: [...referrals.entries()].map(([host, count]) => ({ host, sessions: count })).sort((a, b) => b.sessions - a.sessions).slice(0, 10)
    };
}

function siteOf(db, appId) {
    const app = db.prepare('SELECT id, name, url FROM apps WHERE id = ? AND analytics_enabled = 1').get(appId);
    if (!app?.url) throw Object.assign(new Error('האתר לא נמצא.'), { status: 404 });
    const url = new URL(app.url);
    return { app, host: url.hostname, basePath: url.pathname };
}

function validateLink(db, body) {
    const { app, host, basePath } = siteOf(db, Number(body?.app_id));
    const channel = LINK_CHANNELS.includes(body?.channel) ? body.channel : null;
    const code = String(body?.code || '').trim().toLowerCase();
    const campaign = String(body?.campaign || '').trim();
    let path = String(body?.path || basePath).trim() || '/';
    if (!channel) throw Object.assign(new Error('בחרו ערוץ.'), { status: 400 });
    if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(code)) throw Object.assign(new Error('קוד הקישור: אותיות באנגלית, ספרות ומקף, עד 24 תווים.'), { status: 400 });
    if (campaign && !/^[\p{L}\p{N}_. -]{1,60}$/u.test(campaign)) throw Object.assign(new Error('שם הקמפיין יכול להכיל אותיות, ספרות, רווח, נקודה ומקף.'), { status: 400 });
    if (!path.startsWith('/') || path.startsWith('//') || /[\s?#]/.test(path) || path.length > 200) throw Object.assign(new Error('נתיב היעד צריך להתחיל ב־/ ובלי פרמטרים.'), { status: 400 });
    if (db.prepare('SELECT 1 FROM tracked_links WHERE host = ? AND code = ?').get(host, code)) throw Object.assign(new Error('הקוד כבר בשימוש באתר הזה.'), { status: 409 });
    return { app, host, channel, code, campaign, path };
}

function destination(link) {
    const url = new URL(`https://${link.host}${link.path}`);
    url.searchParams.set('utm_source', link.channel);
    url.searchParams.set('utm_medium', 'link');
    url.searchParams.set('utm_campaign', link.campaign || link.code);
    return url.href;
}

/** Resolves `/l/<code>` on a site host; unknown codes fall back to the site home page. */
function resolveLink(db, host, code, { automated = false, internal = false } = {}) {
    const cleanHost = String(host || '').toLowerCase().replace(/:\d+$/, '');
    const link = db.prepare('SELECT * FROM tracked_links WHERE (host = ? OR host = ? OR ? = \'www.\' || host) AND code = ?')
        .get(cleanHost, cleanHost.replace(/^www\./, ''), cleanHost, String(code || '').toLowerCase());
    if (!link) return /^[a-z0-9.-]+$/.test(cleanHost) ? `https://${cleanHost}/` : null;
    if (!internal) {
        db.prepare('INSERT INTO link_clicks (link_id, occurred_at, automation_hint) VALUES (?, ?, ?)')
            .run(link.id, new Date().toISOString(), automated ? 1 : 0);
    }
    return destination(link);
}

function listLinks(db, appId) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    return db.prepare(`SELECT l.*, a.name AS app_name,
            (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id AND c.automation_hint = 0) AS clicks,
            (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id AND c.automation_hint = 0 AND c.occurred_at >= ?) AS clicks_30d,
            (SELECT COUNT(DISTINCT g.session_hash) FROM growth_events g WHERE g.app_id = l.app_id AND g.automation_hint = 0
                AND g.source = l.channel AND g.campaign = CASE WHEN l.campaign <> '' THEN l.campaign ELSE l.code END) AS sessions,
            (SELECT COUNT(DISTINCT g.session_hash) FROM growth_events g WHERE g.app_id = l.app_id AND g.automation_hint = 0
                AND g.event_type = 'contact_click' AND g.source = l.channel AND g.campaign = CASE WHEN l.campaign <> '' THEN l.campaign ELSE l.code END) AS contacts
        FROM tracked_links l JOIN apps a ON a.id = l.app_id ${appId ? 'WHERE l.app_id = ?' : ''} ORDER BY l.created_at DESC`)
        .all(...[since, ...(appId ? [appId] : [])])
        .map((link) => ({ ...link, short_url: `https://${link.host}/l/${link.code}`, destination: destination(link), label: CHANNELS[link.channel] }));
}

function suggestCode(db, appId, channel) {
    const { host } = siteOf(db, appId);
    const base = { whatsapp: 'wa', facebook: 'fb', instagram: 'ig', tiktok: 'tt', google_business: 'g', email: 'mail', sms: 'sms', qr: 'qr', linkedin: 'in', youtube: 'yt', telegram: 'tg' }[channel] || 'link';
    for (let i = 0; i < 50; i++) {
        const code = i ? `${base}${i + 1}` : base;
        if (!db.prepare('SELECT 1 FROM tracked_links WHERE host = ? AND code = ?').get(host, code)) return code;
    }
    return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}

module.exports = { CHANNELS, LINK_CHANNELS, channelOf, sourcesSummary, validateLink, resolveLink, listLinks, suggestCode, destination };
