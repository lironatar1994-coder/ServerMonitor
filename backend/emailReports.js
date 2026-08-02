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
            COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_page_view = 1 THEN ip END) AS unique_candidates,
            SUM(CASE WHEN is_bot = 0 AND is_page_view = 1 THEN 1 ELSE 0 END) AS page_views,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
    `).get(appId, from, to);
}

function getTopPage(appId, from, to) {
    return db.prepare(`
        SELECT path, COUNT(*) AS requests
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
          AND is_bot = 0 AND is_page_view = 1
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
        WHERE NULLIF(TRIM(url), '') IS NOT NULL AND log_path IS NOT NULL
        ORDER BY name ASC
    `).all();

    return apps.map((app) => {
        const current = getRangeStats(app.id, period.from, period.to);
        const previous = getRangeStats(app.id, period.previousFrom, period.from);
        const topPage = getTopPage(app.id, period.from, period.to);
        return {
            ...app,
            uniqueCandidates: Number(current.unique_candidates) || 0,
            previousUniqueCandidates: Number(previous.unique_candidates) || 0,
            uniqueChange: percentChange(current.unique_candidates, previous.unique_candidates),
            pageViews: Number(current.page_views) || 0,
            previousPageViews: Number(previous.page_views) || 0,
            pageViewChange: percentChange(current.page_views, previous.page_views),
            candidateRequests: Number(current.candidate_requests) || 0,
            requestChange: percentChange(current.candidate_requests, previous.candidate_requests),
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

function formatMetricChange(current, previous) {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;
    if (!previousValue && currentValue) return 'חדש בתקופה';
    if (!previousValue) return 'ללא שינוי';
    return formatChange(percentChange(currentValue, previousValue));
}

function formatPeriod(period) {
    const formatter = new Intl.DateTimeFormat('he-IL', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${formatter.format(new Date(period.from))}–${formatter.format(new Date(new Date(period.to).getTime() - 1))}`;
}

function renderEmail(type, period, rows) {
    const title = type === 'daily' ? 'דוח תנועה יומי' : 'דוח תנועה שבועי';
    const periodLabel = formatPeriod(period);
    const siteCards = rows.map((row) => `
      <table role="presentation" class="site-card" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #d8d0c2;margin:0 0 12px">
        <tr><td style="padding:18px 20px;border-bottom:1px solid #e4ded3">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="text-align:right"><strong style="font-size:18px">${escapeHtml(row.name)}</strong><br><span dir="ltr" style="display:inline-block;color:#797267;font-size:12px">${escapeHtml(row.url || '')}</span></td>
            <td width="92" style="text-align:left;color:${row.status === 'online' ? '#1f5a47' : '#b94332'};font-size:13px;font-weight:bold">${row.status === 'online' ? '● פעיל' : '● דורש בדיקה'}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td class="site-metric" width="33%" style="padding:16px 0;text-align:right"><span style="color:#797267;font-size:11px">מועמדים ייחודיים</span><br><strong style="font-size:24px">${formatNumber(row.uniqueCandidates)}</strong><br><small style="color:${row.uniqueCandidates < row.previousUniqueCandidates ? '#b94332' : '#1f5a47'}">${formatMetricChange(row.uniqueCandidates, row.previousUniqueCandidates)}</small></td>
            <td class="site-metric" width="33%" style="padding:16px;text-align:right;border-right:1px solid #eee8dd"><span style="color:#797267;font-size:11px">צפיות בעמודים</span><br><strong style="font-size:24px">${formatNumber(row.pageViews)}</strong><br><small style="color:${row.pageViews < row.previousPageViews ? '#b94332' : '#1f5a47'}">${formatMetricChange(row.pageViews, row.previousPageViews)}</small></td>
            <td class="site-metric" width="33%" style="padding:16px;text-align:right;border-right:1px solid #eee8dd"><span style="color:#797267;font-size:11px">בקשות בוטים</span><br><strong style="font-size:24px">${formatNumber(row.botRequests)}</strong></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 20px;background:#faf7f1;color:#5f594f;font-size:12px">העמוד המוביל: <strong dir="ltr" style="color:#171713">${escapeHtml(row.topPage)}</strong></td></tr>
      </table>`).join('');
    const totals = rows.reduce((sum, row) => ({ visitors: sum.visitors + row.uniqueCandidates, pageViews: sum.pageViews + row.pageViews, bots: sum.bots + row.botRequests }), { visitors: 0, pageViews: 0, bots: 0 });
    const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.email-wrap{padding:12px!important}.hero{padding:24px 20px!important}.summary-cell{display:block!important;width:auto!important;border-right:0!important;border-bottom:1px solid #e4ded3}.site-metric{display:block!important;width:auto!important;border-right:0!important;border-bottom:1px solid #eee8dd;padding:13px 0!important}}</style></head><body style="margin:0;background:#eee8dc;color:#171713;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${title}: מועמדים, צפיות בעמודים, בוטים והשוואה לתקופה הקודמת.</div><div class="email-wrap" style="max-width:720px;margin:0 auto;padding:24px"><div class="hero" style="background:#171713;color:#f5efe3;padding:32px"><div style="color:#dc604b;font-size:11px;font-weight:bold;letter-spacing:1.4px">VEE MONITOR / TRAFFIC EDITION</div><h1 style="margin:12px 0 8px;font-size:34px;line-height:1.1">${title}</h1><div style="color:#c5beb2">תקופה שהושלמה · ${periodLabel}</div></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-collapse:collapse;margin-bottom:18px"><tr><td class="summary-cell" width="33%" style="padding:20px;border-left:1px solid #e4ded3"><strong style="font-size:28px">${formatNumber(totals.visitors)}</strong><br><span style="font-size:12px;color:#6f695f">מועמדים ייחודיים לפי אתר</span></td><td class="summary-cell" width="33%" style="padding:20px;border-left:1px solid #e4ded3"><strong style="font-size:28px">${formatNumber(totals.pageViews)}</strong><br><span style="font-size:12px;color:#6f695f">צפיות בעמודים</span></td><td class="summary-cell" width="33%" style="padding:20px"><strong style="font-size:28px">${formatNumber(totals.bots)}</strong><br><span style="font-size:12px;color:#6f695f">בקשות בוטים שסוננו</span></td></tr></table>${siteCards || '<div style="background:#fff;padding:28px;text-align:center">אין אתרים להצגה</div>'}<div style="background:#ded6c8;padding:18px 20px;margin-top:18px;color:#554f46;font-size:12px;line-height:1.7"><strong style="color:#171713">איך לקרוא את הנתונים</strong><br>מועמד הוא כתובת IP עם לפחות צפייה אחת בעמוד שלא זוהתה כבוט — זו הערכה, לא אימות של אדם. צפיות בעמודים אינן כוללות תמונות, קובצי JavaScript, גופנים או בקשות API. השינוי מושווה לתקופה הקודמת באותו אורך ולפי שעון ישראל.</div><a href="https://monitor.vee-app.co.il/serve-monitor/visitors" style="display:block;background:#d5543f;color:#fff;text-decoration:none;text-align:center;padding:15px 18px;margin-top:14px;font-weight:bold">פתיחת תמונת המבקרים המלאה ←</a><p style="margin:18px 4px;color:#81796d;font-size:11px;text-align:center">Vee Monitor · דוח אוטומטי לתקופה שהושלמה</p></div></body></html>`;
    const text = [title, periodLabel, 'מועמד = כתובת IP עם צפייה בעמוד שלא זוהתה כבוט; זו אינה הוכחה לאדם.', 'צפיות בעמודים אינן כוללות קובצי תמונה, JavaScript, גופנים או API.', '', ...rows.map((row) => `${row.name}: ${row.uniqueCandidates} מועמדים (${formatMetricChange(row.uniqueCandidates, row.previousUniqueCandidates)}), ${row.pageViews} צפיות בעמודים (${formatMetricChange(row.pageViews, row.previousPageViews)}), ${row.botRequests} בקשות בוטים, עמוד מוביל ${row.topPage}, סטטוס ${row.status}`)].join('\n');
    return { subject: `Vee Monitor — ${title} | ${periodLabel}`, html, text };
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
