const fs = require('fs');

const DEFAULT_TAIL_BYTES = 65536;
const VISITOR_TAIL_BYTES = 2097152;

const botUserAgentPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /crawl/i,
    /slurp/i,
    /bingpreview/i,
    /facebookexternalhit/i,
    /embedly/i,
    /quora link preview/i,
    /outbrain/i,
    /pinterest/i,
    /vkshare/i,
    /telegrambot/i,
    /whatsapp/i,
    /discordbot/i,
    /linkedinbot/i,
    /twitterbot/i,
    /google-inspectiontool/i,
    /pagespeed/i,
    /lighthouse/i,
    /headlesschrome/i,
    /python-requests/i,
    /curl/i,
    /wget/i,
    /go-http-client/i,
    /java\//i,
    /libwww-perl/i,
    /httpclient/i,
    /axios/i
];

const suspiciousPathPatterns = [
    /\/wp-admin/i,
    /\/wp-login\.php/i,
    /\/wp-content/i,
    /\/xmlrpc\.php/i,
    /\/phpmyadmin/i,
    /\/\.env/i,
    /\/vendor\/phpunit/i,
    /\/cgi-bin/i,
    /\/boaform/i,
    /\/HNAP1/i,
    /\/etc\/passwd/i,
    /\/actuator/i,
    /\/solr/i,
    /\/server-status/i
];

function readLogTail(logPath, tailBytes = DEFAULT_TAIL_BYTES) {
    if (!logPath || !fs.existsSync(logPath)) return [];

    const fd = fs.openSync(logPath, 'r');
    try {
        const stat = fs.fstatSync(fd);
        const bufferSize = Math.min(stat.size, tailBytes);
        const buffer = Buffer.alloc(bufferSize);
        const position = Math.max(0, stat.size - bufferSize);

        fs.readSync(fd, buffer, 0, bufferSize, position);

        return buffer.toString('utf-8').split('\n').filter((line) => line.trim().length > 0);
    } finally {
        fs.closeSync(fd);
    }
}

function isTargetAppLine(line, appName, logFilter) {
    if (logFilter) {
        return logFilter
            .split('|')
            .map((filter) => filter.trim())
            .filter(Boolean)
            .some((filter) => line.includes(filter));
    }
    if (appName === 'PDF Generator') return line.includes('/text-to-pdf');
    if (appName === 'Vee Main App') return !line.includes('/text-to-pdf') && !line.includes('/serve-monitor');
    return true;
}

function parseNginxAccessLine(line) {
    const match = line.match(/^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+([^\s"]+)(?:\s+[^"]*)?"\s+(\d{3})\s+\S+\s+"([^"]*)"\s+"([^"]*)"/);
    if (!match) return null;

    const [, ip, timestamp, method, rawPath, status, referrer, userAgent] = match;
    const path = rawPath.split('?')[0] || rawPath;

    return {
        ip,
        timestamp,
        method,
        path,
        status: parseInt(status, 10),
        referrer,
        userAgent
    };
}

function getBotReason(entry, rawLine = '') {
    const userAgent = (entry?.userAgent || '').trim();
    const path = entry?.path || '';
    const method = entry?.method || '';

    if (!userAgent || userAgent === '-') return 'missing user agent';
    if (botUserAgentPatterns.some((pattern) => pattern.test(userAgent))) return 'bot user agent';
    if (suspiciousPathPatterns.some((pattern) => pattern.test(path))) return 'scanner path';
    if (['PROPFIND', 'OPTIONS', 'CONNECT', 'TRACE'].includes(method)) return 'scanner method';
    if (/sql|eval\(|etc\/passwd|base64_decode|union.*select/i.test(rawLine)) return 'attack signature';

    return '';
}

function getAgentType(entry, rawLine = '') {
    if (getBotReason(entry, rawLine)) return 'Bot';

    const userAgent = entry?.userAgent || '';
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(userAgent)) return 'Mobile';
    if (/Windows|Macintosh|Linux|X11/i.test(userAgent)) return 'Desktop';

    return 'Unknown';
}

function isAttackLine(line, entry) {
    return Boolean(
        suspiciousPathPatterns.some((pattern) => pattern.test(entry?.path || '')) ||
        /PROPFIND|sql|eval\(|etc\/passwd|base64_decode|union.*select/i.test(line)
    );
}

function parseNginxLogMetrics(logPath, appName, logFilter) {
    if (!logPath || !fs.existsSync(logPath)) {
        return { visitors: 0, requests: 0, attacks: 0, total_requests: 0, bot_requests: 0, bot_visitors: 0 };
    }

    try {
        const lines = readLogTail(logPath);
        const humanIps = new Set();
        const botIps = new Set();
        let humanRequests = 0;
        let botRequests = 0;
        let totalRequests = 0;
        let attacks = 0;

        lines.forEach((line) => {
            if (!isTargetAppLine(line, appName, logFilter)) return;

            totalRequests++;
            const entry = parseNginxAccessLine(line);
            if (!entry) return;

            if (isAttackLine(line, entry)) attacks++;

            const botReason = getBotReason(entry, line);
            if (botReason) {
                botRequests++;
                if (entry.ip) botIps.add(entry.ip);
                return;
            }

            humanRequests++;
            if (entry.ip) humanIps.add(entry.ip);
        });

        return {
            visitors: humanIps.size,
            requests: humanRequests,
            attacks,
            total_requests: totalRequests,
            bot_requests: botRequests,
            bot_visitors: botIps.size
        };
    } catch (error) {
        console.error('Error parsing log:', error.message);
        return { visitors: 0, requests: 0, attacks: 0, total_requests: 0, bot_requests: 0, bot_visitors: 0 };
    }
}

function getRecentVisitors(logPath, appName, logFilter, limit = 100) {
    if (!logPath || !fs.existsSync(logPath)) return [];

    const lines = readLogTail(logPath, VISITOR_TAIL_BYTES);
    const visitors = [];

    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!isTargetAppLine(line, appName, logFilter)) continue;

        const entry = parseNginxAccessLine(line);
        if (!entry) continue;

        const botReason = getBotReason(entry, line);
        visitors.push({
            ip: entry.ip,
            timestamp: entry.timestamp,
            method: entry.method,
            path: entry.path,
            status: entry.status,
            agent: getAgentType(entry, line),
            is_bot: Boolean(botReason),
            bot_reason: botReason || null
        });

        if (visitors.length >= limit) break;
    }

    return visitors;
}

module.exports = {
    getAgentType,
    getBotReason,
    getRecentVisitors,
    isTargetAppLine,
    parseNginxAccessLine,
    parseNginxLogMetrics
};
