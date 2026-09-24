const db = require('./database');
const { getLibiJewelryInterest } = require('./jewelryAnalytics');

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
    const eventStats = db.prepare(`
        SELECT
            COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_page_view = 1 THEN ip END) AS unique_candidates,
            SUM(CASE WHEN is_bot = 0 AND is_page_view = 1 THEN 1 ELSE 0 END) AS page_views,
            SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS candidate_requests,
            SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests
        FROM visitor_events
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
    `).get(appId, from, to);
    const signalStats = db.prepare(`
        SELECT
            COUNT(DISTINCT CASE WHEN automation_hint = 0 THEN visitor_hash END) AS browser_signal_visitors,
            COUNT(DISTINCT CASE WHEN automation_hint = 0 THEN session_hash END) AS browser_signal_sessions,
            SUM(CASE WHEN automation_hint = 0 THEN 1 ELSE 0 END) AS browser_signal_page_views
        FROM browser_signals
        WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
    `).get(appId, from, to);
    return { ...eventStats, ...signalStats };
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
        WHERE analytics_enabled = 1 AND reporting_enabled = 1
          AND NULLIF(TRIM(url), '') IS NOT NULL AND log_path IS NOT NULL
        ORDER BY name ASC
    `).all();

    return apps.map((app) => {
        const current = getRangeStats(app.id, period.from, period.to);
        const previous = getRangeStats(app.id, period.previousFrom, period.from);
        const topPage = getTopPage(app.id, period.from, period.to);
        const jewelryInterest = app.name === 'Libi Diamonds'
            ? getLibiJewelryInterest(db, app.id, { from: period.from, to: period.to })
            : null;
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
            browserSignalVisitors: Number(current.browser_signal_visitors) || 0,
            previousBrowserSignalVisitors: Number(previous.browser_signal_visitors) || 0,
            browserSignalChange: percentChange(current.browser_signal_visitors, previous.browser_signal_visitors),
            browserSignalSessions: Number(current.browser_signal_sessions) || 0,
            previousBrowserSignalSessions: Number(previous.browser_signal_sessions) || 0,
            browserSignalPageViews: Number(current.browser_signal_page_views) || 0,
            previousBrowserSignalPageViews: Number(previous.browser_signal_page_views) || 0,
            contactClicks: Number(db.prepare(`SELECT COUNT(*) AS count FROM growth_events
                WHERE app_id = ? AND occurred_at >= ? AND occurred_at < ?
                AND automation_hint = 0 AND event_type = 'contact_click'`).get(app.id, period.from, period.to).count),
            topPage: topPage.path || '—',
            jewelryInterest
        };
    });
}

const { renderEmail } = require('./emailReportTemplate');

function buildOperationsData() {
    return db.prepare('SELECT id, name, url, status, last_checked, pm2_name, systemd_unit, analytics_enabled, reporting_enabled FROM apps ORDER BY name').all();
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
    const content = renderEmail(type, period, rows, buildOperationsData());
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

module.exports = { buildOperationsData, buildPeriod, buildReportData, checkSchedules, renderEmail, sendReport, startEmailReports };
