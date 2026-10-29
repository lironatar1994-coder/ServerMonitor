// Outage, outside-only failure, slowness, silent-measurement and recovery alerts by email and browser push,
// batched per monitor cycle.
const BASE = 'https://monitor.vee-app.co.il/serve-monitor';
const STATUS = { offline: 'לא פועל', error: 'בדיקת הכתובת נכשלה', unknown: 'לא נבדק' };

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// Host-check messages from ops/maintenance.py, in the alert's language; anything else stays as written.
const REASONS = [
    [/^Certificate expires within (\d+) days: (.+)$/, (m) => `התעודה של ${m[2]} פגה בתוך ${m[1]} יום ולא חודשה`],
    [/^Last successful backup is older than (\d+) hours$/, (m) => `הגיבוי המאומת האחרון ישן מ־${m[1]} שעות`],
    [/^No successful verified backup recorded$/, () => 'אין גיבוי מאומת'],
    [/^Service not active: (.+)$/, (m) => `השירות ${m[1]} לא פועל`],
    [/^PM2 process not online: (.+)$/, (m) => `התהליך ${m[1]} לא פועל`],
    [/^Disk usage ([\d.]+)%$/, (m) => `הדיסק מלא ב־${m[1]}%`],
    [/^host checks stopped$/, () => 'בדיקות השרת לא רצו בחצי השעה האחרונה'],
    [/^Site browser check failed: (.+)$/, (m) => `בדיקת הדפדפן נכשלה ${m[1].includes(', ') ? 'באתרים' : 'באתר'} ${m[1]}`],
    [/^Monitor dashboard check failed: (.+)$/, (m) => `מסך במוניטור לא עבר את בדיקת הדפדפן (${m[1]})`],
    [/^Browser check has not completed for (\d+) hours$/, (m) => `בדיקת הדפדפן לא הושלמה ${m[1]} שעות, והאתרים לא נבדקו`],
    [/^Portfolio\/monitor browser check is stale$/, () => 'אין תוצאה עדכנית של בדיקת הדפדפן'],
    [/^Portfolio\/monitor browser or tracking check failed/, () => 'בדיקת הדפדפן נכשלה'],
];
const reason = (text) => {
    for (const [pattern, render] of REASONS) { const m = pattern.exec(text); if (m) return render(m); }
    return text;
};

function describe(item) {
    if (item.kind === 'up') return 'חזר לפעול';
    if (item.kind === 'slow') return `איטי: ${(item.ms / 1000).toFixed(1)} שניות לתגובה`;
    if (item.kind === 'silent') return 'מדידת הדפדפן שותקת 6 שעות, למרות ביקורים בשרת';
    if (item.kind === 'external') return `לא נפתח מבחוץ (${item.sources.join(', ')})${item.error ? `: ${item.error}` : ''}, אף שהשרת עונה`;
    const why = item.detail ? `: ${item.detail.split('; ').map(reason).join(' · ')}` : '';
    return `${item.detail ? 'נמצאו תקלות' : STATUS[item.status] || item.status}${why}${item.reminder ? ' (עדיין)' : ''}`;
}
const link = (item) => `${BASE}/${item.kind === 'silent' ? 'visitors' : 'services'}/${item.id}`;
const color = (item) => item.kind === 'up' ? '#24734F' : item.kind === 'down' ? '#B13443' : '#875A13';

function renderAlert(changes, now = new Date()) {
    const group = (kind) => changes.filter((item) => item.kind === kind).map((item) => item.name).join(', ');
    const subject = [['down', 'לא זמין'], ['external', 'לא נפתח מבחוץ'], ['slow', 'איטי'], ['silent', 'מדידה שותקת'], ['up', 'חזר לפעול']]
        .filter(([kind]) => group(kind)).map(([kind, label]) => `${label}: ${group(kind)}`).join(' · ');
    const time = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
    const rows = changes.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #DCE3EB">`
        + `<a href="${link(item)}" style="color:#0F6372;font-weight:600;text-decoration:none">${escapeHtml(item.name)}</a></td>`
        + `<td style="padding:8px 12px;border-bottom:1px solid #DCE3EB;color:${color(item)}">${escapeHtml(describe(item))}</td></tr>`).join('');
    const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:16px;background:#F5F7FA;font-family:'Noto Sans Hebrew',Arial,sans-serif;color:#18283A">`
        + `<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE3EB;border-radius:12px;padding:16px">`
        + `<p style="margin:0 0 8px;font-size:13px;color:#556578">Server Monitor · ${escapeHtml(time)}</p>`
        + `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>`
        + `<p style="margin:12px 0 0;font-size:13px;color:#556578">תזכורת נשלחת כל שש שעות כל עוד הבעיה נמשכת.</p></div></body></html>`;
    const text = [`Server Monitor · ${time}`, ...changes.map((item) => `${item.name}: ${describe(item)} — ${link(item)}`)].join('\n');
    return { subject, html, text };
}

async function sendEmail(content) {
    // Required lazily so the alert module stays testable without the database.
    const { getMailerConfig } = require('./emailReports');
    const config = getMailerConfig();
    const recipient = process.env.ALERT_EMAIL_TO || config.recipient;
    if (!config.apiKey || !recipient || !config.from || config.from.includes('<undefined>')) {
        console.warn('[Monitor Alert] Email alerts are not configured');
        return false;
    }
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.from, to: [recipient], subject: content.subject, html: content.html, text: content.text }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Resend failed (${response.status})`);
        return true;
    } catch (error) {
        console.error('[Monitor Alert] Email delivery failed:', error.message);
        return false;
    }
}

async function sendPushAlert(changes, subject) {
    try {
        const first = changes.find((item) => item.kind !== 'up') || changes[0];
        const { delivered } = await require('./push').sendPush({ title: subject, body: changes.map((item) => `${item.name}: ${describe(item)}`).join('\n').slice(0, 300),
            url: link(first).replace('https://monitor.vee-app.co.il', '') },
            // A service going down reaches devices even in their quiet hours.
            { category: 'outage', urgent: changes.some((item) => item.kind === 'down') });
        return delivered > 0;
    } catch (error) {
        console.error('[Monitor Alert] Push delivery failed:', error.message);
        return false;
    }
}

async function sendAlertEmail(changes) {
    if (!changes.length) return { sent: false };
    const content = renderAlert(changes);
    const [email, pushed] = await Promise.all([sendEmail(content), sendPushAlert(changes, content.subject)]);
    if (email || pushed) console.log(`[Monitor Alert] Delivered ${changes.length} change(s) (email ${email}, push ${pushed})`);
    return { sent: email || pushed };
}

module.exports = { renderAlert, sendAlertEmail };
