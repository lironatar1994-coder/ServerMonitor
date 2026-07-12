const db = require('./database');

const TIMEZONE = 'Asia/Jerusalem';
const DAILY_HOUR = Number(process.env.REPORT_DAILY_HOUR || 8);
const WEEKLY_HOUR = Number(process.env.REPORT_WEEKLY_HOUR || 8);
const WEEKLY_MINUTE = Number(process.env.REPORT_WEEKLY_MINUTE || 5);
const CHECK_INTERVAL_MS = 60 * 1000;

let schedulerTimer = null;
let sending = false;

function getIsraelParts(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((parts, part) => {
        if (part.type !== 'literal') parts[part.type] = Number(part.value);
        return parts;
    }, {});
}

function getTimezoneOffset(date) {
    const value = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        timeZoneName: 'longOffset'
    }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+00:00';
    const match = value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;
    const minutes = (Number(match[2]) * 60) + Number(match[3]);
    return (match[1] === '+' ? 1 : -1) * minutes * 60 * 1000;
}

function israelMidnightUtc(year, month, day) {
    const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    return new Date(guess.getTime() - getTimezoneOffset(guess));
}

function shiftLocalDate(parts, days) {
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function buildPeriod(type, now = new Date()) {
    const today = getIsraelParts(now);
    if (type === 'daily') {
        const toLocal = { year: today.year, month: today.month, day: today.day };
        const fromLocal = shiftLocalDate(toLocal, -1);
        const previousFromLocal = shiftLocalDate(toLocal, -2);
        return {
            type,
            periodKey: dateKey(fromLocal),
            from: israelMidnightUtc(fromLocal.year, fromLocal.month, fromLocal.day).toISOString(),
            to: israelMidnightUtc(toLocal.year, toLocal.month, toLocal.day).toISOString(),
            previousFrom: israelMidnightUtc(previousFromLocal.year, previousFromLocal.month, previousFromLocal.day).toISOString()
        };
    }

    const localDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
    const currentMonday = shiftLocalDate(today, -daysSinceMonday);
    const previousMonday = shiftLocalDate(currentMonday, -7);
    const comparisonMonday = shiftLocalDate(currentMonday, -14);
    return {
        type,
        periodKey: dateKey(previousMonday),
        from: israelMidnightUtc(previousMonday.year, previousMonday.month, previousMonday.day).toISOString(),
        to: israelMidnightUtc(currentMonday.year, currentMonday.month, currentMonday.day).toISOString(),
        previousFrom: israelMidnightUtc(comparisonMonday.year, comparisonMonday.month, comparisonMonday.day).toISOString()
    };
}

function getRangeStats(appId, from, to) {
    return db.prepare(`
        SELECT
            COUNT(DISTINCT CASE WHEN is_bot = 0 THEN ip END) AS unique_humans,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS human_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
    `).get(appId, from, to);
}

function getTopPage(appId, from, to) {
    return db.prepare(`
        SELECT path, COUNT(*) AS requests
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ? AND is_bot = 0
        GROUP BY path ORDER BY requests DESC, path ASC LIMIT 1
    `).get(appId, from, to) || { path: '—', requests: 0 };
}

function percentChange(current, previous) {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;
    if (!previousValue) return currentValue ? 100 : 0;
    return ((currentValue - previousValue) / previousValue) * 100;
}

function buildReportData(period) {
    const apps = db.prepare(`
        SELECT id, name, url, status
        FROM apps
        WHERE url IS NOT NULL AND log_path IS NOT NULL
        ORDER BY name ASC
    `).all();

    return apps.map((app) => {
        const current = getRangeStats(app.id, period.from, period.to);
        const previous = getRangeStats(app.id, period.previousFrom, period.from);
        const topPage = getTopPage(app.id, period.from, period.to);
        return {
            ...app,
            uniqueHumans: Number(current.unique_humans) || 0,
            uniqueChange: percentChange(current.unique_humans, previous.unique_humans),
            humanRequests: Number(current.human_requests) || 0,
            requestChange: percentChange(current.human_requests, previous.human_requests),
            botRequests: Number(current.bot_requests) || 0,
            topPage: topPage.path || '—'
        };
    });
}

function formatNumber(value) {
    return new Intl.NumberFormat('he-IL').format(Number(value) || 0);
}

function formatChange(value) {
    const number = Number(value) || 0;
    const arrow = number > 0 ? '↑' : number < 0 ? '↓' : '—';
    return `${arrow} ${Math.abs(number).toFixed(0)}%`;
}

function formatPeriod(period) {
    const formatter = new Intl.DateTimeFormat('he-IL', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${formatter.format(new Date(period.from))}–${formatter.format(new Date(new Date(period.to).getTime() - 1))}`;
}

function renderEmail(type, period, rows) {
    const title = type === 'daily' ? 'סיכום לקוחות יומי' : 'סיכום לקוחות שבועי';
    const tableRows = rows.map((row) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca"><strong>${escapeHtml(row.name)}</strong><br><span style="color:#777;font-size:12px">${escapeHtml(row.url || '')}</span></td>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca;color:${row.status === 'online' ? '#1f5a47' : '#d5543f'}"><strong>${row.status === 'online' ? 'פעיל' : 'בדיקה'}</strong></td>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca;text-align:center"><strong>${formatNumber(row.uniqueHumans)}</strong><br><span>${formatChange(row.uniqueChange)}</span></td>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca;text-align:center"><strong>${formatNumber(row.humanRequests)}</strong><br><span>${formatChange(row.requestChange)}</span></td>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca;text-align:center">${formatNumber(row.botRequests)}</td>
          <td style="padding:12px;border-bottom:1px solid #ddd7ca;direction:ltr;text-align:left">${escapeHtml(row.topPage)}</td>
        </tr>`).join('');
    const totals = rows.reduce((sum, row) => ({ visitors: sum.visitors + row.uniqueHumans, requests: sum.requests + row.humanRequests, bots: sum.bots + row.botRequests }), { visitors: 0, requests: 0, bots: 0 });
    const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f2ebdd;color:#171713;font-family:Arial,sans-serif"><div style="max-width:920px;margin:0 auto;padding:28px"><div style="background:#171713;color:#f2ebdd;padding:28px"><div style="color:#d5543f;font-size:12px;font-weight:bold">VEE MONITOR / REPORT</div><h1 style="margin:12px 0 6px;font-size:34px">${title}</h1><div style="color:#bbb5aa">${formatPeriod(period)}</div></div><div style="display:flex;background:#fff;border-bottom:1px solid #171713"><div style="padding:18px;flex:1"><strong style="font-size:28px">${formatNumber(totals.visitors)}</strong><br>מבקרים ייחודיים</div><div style="padding:18px;flex:1"><strong style="font-size:28px">${formatNumber(totals.requests)}</strong><br>בקשות אנושיות</div><div style="padding:18px;flex:1"><strong style="font-size:28px">${formatNumber(totals.bots)}</strong><br>בקשות בוטים</div></div><table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;font-size:14px"><thead><tr style="background:#e5ddce"><th style="padding:12px;text-align:right">לקוח</th><th style="padding:12px;text-align:right">סטטוס</th><th style="padding:12px">מבקרים / שינוי</th><th style="padding:12px">בקשות / שינוי</th><th style="padding:12px">בוטים</th><th style="padding:12px;text-align:right">עמוד מוביל</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6" style="padding:28px;text-align:center">אין לקוחות להצגה</td></tr>'}</tbody></table><p style="color:#6f695f;font-size:12px;line-height:1.6">מבקר ייחודי מבוסס על כתובת IP אנושית. השינוי מושווה לתקופה הקודמת באותו אורך. הנתונים לפי שעון ישראל.</p><a href="https://vee-app.co.il/serve-monitor/visitors" style="display:inline-block;background:#d5543f;color:white;text-decoration:none;padding:12px 18px;font-weight:bold">פתיחת תמונת המבקרים</a></div></body></html>`;
    const text = [title, formatPeriod(period), '', ...rows.map((row) => `${row.name}: ${row.uniqueHumans} מבקרים (${formatChange(row.uniqueChange)}), ${row.humanRequests} בקשות (${formatChange(row.requestChange)}), ${row.botRequests} בוטים, עמוד מוביל ${row.topPage}, סטטוס ${row.status}`)].join('\n');
    return { subject: `Vee Monitor — ${title} | ${formatPeriod(period)}`, html, text };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

function getMailerConfig() {
    const apiKey = process.env.RESEND_API_KEY;
    const recipient = process.env.REPORT_EMAIL_TO;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    const fromName = process.env.EMAIL_FROM || 'Vee Monitor';
    const from = fromName.includes('@') ? fromName : `${fromName} <${fromAddress}>`;
    return { apiKey, recipient, from };
}

async function sendReport(type, options = {}) {
    const period = options.period || buildPeriod(type, options.now);
    const config = getMailerConfig();
    if (!config.apiKey || !config.recipient || !config.from || config.from.includes('<undefined>')) {
        throw new Error('Email reporting is not configured');
    }
    if (!options.force) {
        const sent = db.prepare(`SELECT id FROM email_report_deliveries WHERE report_type = ? AND period_key = ? AND recipient = ? AND status = 'sent'`).get(type, period.periodKey, config.recipient);
        if (sent) return { skipped: true, reason: 'already-sent', periodKey: period.periodKey };
    }
    const rows = buildReportData(period);
    const content = renderEmail(type, period, rows);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.from, to: [config.recipient], subject: content.subject, html: content.html, text: content.text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        db.prepare(`INSERT INTO email_report_deliveries (report_type, period_key, recipient, status, error) VALUES (?, ?, ?, 'failed', ?) ON CONFLICT(report_type, period_key, recipient) DO UPDATE SET status = 'failed', error = excluded.error, sent_at = CURRENT_TIMESTAMP`).run(type, period.periodKey, config.recipient, result.message || `HTTP ${response.status}`);
        throw new Error(result.message || `Resend failed (${response.status})`);
    }
    db.prepare(`INSERT INTO email_report_deliveries (report_type, period_key, recipient, provider_id, status, error) VALUES (?, ?, ?, ?, 'sent', NULL) ON CONFLICT(report_type, period_key, recipient) DO UPDATE SET provider_id = excluded.provider_id, status = 'sent', error = NULL, sent_at = CURRENT_TIMESTAMP`).run(type, period.periodKey, config.recipient, result.id || null);
    return { sent: true, id: result.id || null, periodKey: period.periodKey, rows: rows.length };
}

async function checkSchedules(now = new Date()) {
    if (sending || !process.env.REPORT_EMAIL_TO) return;
    const parts = getIsraelParts(now);
    if (parts.hour < DAILY_HOUR) return;
    sending = true;
    try {
        const daily = await sendReport('daily', { now });
        if (daily.sent) console.log(`[Email Report] Daily report sent (${daily.periodKey}, ${daily.rows} clients)`);
        const weeklyDue = parts.hour > WEEKLY_HOUR || (parts.hour === WEEKLY_HOUR && parts.minute >= WEEKLY_MINUTE);
        if (weeklyDue) {
            const weekly = await sendReport('weekly', { now });
            if (weekly.sent) console.log(`[Email Report] Weekly report sent (${weekly.periodKey}, ${weekly.rows} clients)`);
        }
    } catch (error) {
        console.error('[Email Report] Delivery failed:', error.message);
    } finally {
        sending = false;
    }
}

function startEmailReports() {
    if (schedulerTimer || !process.env.REPORT_EMAIL_TO) return;
    console.log(`[Email Report] Scheduler active for ${process.env.REPORT_EMAIL_TO}`);
    setTimeout(checkSchedules, 5000);
    schedulerTimer = setInterval(checkSchedules, CHECK_INTERVAL_MS);
}

module.exports = { buildPeriod, buildReportData, checkSchedules, renderEmail, sendReport, startEmailReports };
