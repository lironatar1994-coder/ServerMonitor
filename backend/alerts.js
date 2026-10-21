// Outage and recovery alerts by email, batched per monitor cycle.
const BASE = 'https://monitor.vee-app.co.il/serve-monitor';
const STATUS = { offline: 'לא פועל', error: 'בדיקת הכתובת נכשלה', unknown: 'לא נבדק' };

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function renderAlert(changes, now = new Date()) {
    const down = changes.filter((item) => item.kind === 'down');
    const up = changes.filter((item) => item.kind === 'up');
    const names = (items) => items.map((item) => item.name).join(', ');
    const subject = down.length
        ? `לא זמין: ${names(down)}${up.length ? ` · חזר לפעול: ${names(up)}` : ''}`
        : `חזר לפעול: ${names(up)}`;
    const time = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
    const line = (item) => item.kind === 'down'
        ? `${item.name}: ${STATUS[item.status] || item.status}${item.reminder ? ' (עדיין)' : ''}`
        : `${item.name}: חזר לפעול`;
    const rows = changes.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #DCE3EB">`
        + `<a href="${BASE}/services/${item.id}" style="color:#0F6372;font-weight:600;text-decoration:none">${escapeHtml(item.name)}</a></td>`
        + `<td style="padding:8px 12px;border-bottom:1px solid #DCE3EB;color:${item.kind === 'down' ? '#B13443' : '#24734F'}">`
        + `${escapeHtml(item.kind === 'down' ? (STATUS[item.status] || item.status) : 'חזר לפעול')}${item.reminder ? ' · עדיין' : ''}</td></tr>`).join('');
    const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:16px;background:#F5F7FA;font-family:'Noto Sans Hebrew',Arial,sans-serif;color:#18283A">`
        + `<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE3EB;border-radius:12px;padding:16px">`
        + `<p style="margin:0 0 8px;font-size:13px;color:#556578">Server Monitor · ${escapeHtml(time)}</p>`
        + `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>`
        + `<p style="margin:12px 0 0;font-size:13px;color:#556578">תזכורת נשלחת כל שש שעות כל עוד השירות אינו זמין.</p></div></body></html>`;
    const text = [`Server Monitor · ${time}`, ...changes.map((item) => `${line(item)} — ${BASE}/services/${item.id}`)].join('\n');
    return { subject, html, text };
}

async function sendAlertEmail(changes) {
    if (!changes.length) return { sent: false };
    // Required lazily so the alert module stays testable without the database.
    const { getMailerConfig } = require('./emailReports');
    const config = getMailerConfig();
    const recipient = process.env.ALERT_EMAIL_TO || config.recipient;
    if (!config.apiKey || !recipient || !config.from || config.from.includes('<undefined>')) {
        console.warn('[Monitor Alert] Email alerts are not configured');
        return { sent: false };
    }
    const content = renderAlert(changes);
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.from, to: [recipient], subject: content.subject, html: content.html, text: content.text }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`Resend failed (${response.status})`);
        console.log(`[Monitor Alert] Emailed ${changes.length} status change(s)`);
        return { sent: true };
    } catch (error) {
        console.error('[Monitor Alert] Delivery failed:', error.message);
        return { sent: false };
    }
}

module.exports = { renderAlert, sendAlertEmail };
