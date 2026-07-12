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

function parseAccessLogTimestamp(timestamp) {
    if (!timestamp) return 0;

    const monthMap = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11
    };
    const match = timestamp.toString().match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?/);
    if (!match) {
        const parsed = Date.parse(timestamp);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    const [, day, month, year, hour, minute, second, sign, offsetHour, offsetMinute] = match;
    const localTime = Date.UTC(Number(year), monthMap[month] ?? 0, Number(day), Number(hour), Number(minute), Number(second));
    if (!sign) return localTime;
    const offset = ((Number(offsetHour) * 60) + Number(offsetMinute)) * 60 * 1000;
    return sign === '+' ? localTime - offset : localTime + offset;
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

function incrementCount(map, key) {
    if (!key && key !== 0) return;
    const normalizedKey = key.toString();
    map.set(normalizedKey, (map.get(normalizedKey) || 0) + 1);
}

function getTopCounts(map, limit = 5) {
    return Array.from(map.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));
}

function getUniqueVisitors(logPath, appName, logFilter, limit = 250) {
    if (!logPath || !fs.existsSync(logPath)) {
        return {
            summary: {
                total_unique: 0,
                human_unique: 0,
                bot_unique: 0,
                mixed_unique: 0,
                total_requests: 0,
                human_requests: 0,
                bot_requests: 0
            },
            visitors: []
        };
    }

    const lines = readLogTail(logPath, VISITOR_TAIL_BYTES);
    const grouped = new Map();
    const humanIps = new Set();
    const botIps = new Set();
    let totalRequests = 0;
    let humanRequests = 0;
    let botRequests = 0;

    lines.forEach((line) => {
        if (!isTargetAppLine(line, appName, logFilter)) return;

        const entry = parseNginxAccessLine(line);
        if (!entry?.ip) return;

        totalRequests++;
        const timestampValue = parseAccessLogTimestamp(entry.timestamp);
        const botReason = getBotReason(entry, line);
        const isBot = Boolean(botReason);
        const agent = getAgentType(entry, line);

        if (isBot) {
            botRequests++;
            botIps.add(entry.ip);
        } else {
            humanRequests++;
            humanIps.add(entry.ip);
        }

        if (!grouped.has(entry.ip)) {
            grouped.set(entry.ip, {
                ip: entry.ip,
                first_seen: entry.timestamp,
                first_seen_value: timestampValue,
                last_seen: entry.timestamp,
                last_seen_value: timestampValue,
                requests: 0,
                human_requests: 0,
                bot_requests: 0,
                agents: new Map(),
                paths: new Map(),
                methods: new Map(),
                statuses: new Map(),
                bot_reasons: new Map()
            });
        }

        const visitor = grouped.get(entry.ip);
        visitor.requests++;
        if (isBot) {
            visitor.bot_requests++;
            incrementCount(visitor.bot_reasons, botReason);
        } else {
            visitor.human_requests++;
        }

        incrementCount(visitor.agents, agent);
        incrementCount(visitor.paths, entry.path);
        incrementCount(visitor.methods, entry.method);
        incrementCount(visitor.statuses, entry.status);

        if (!visitor.first_seen_value || timestampValue < visitor.first_seen_value) {
            visitor.first_seen = entry.timestamp;
            visitor.first_seen_value = timestampValue;
        }
        if (timestampValue >= visitor.last_seen_value) {
            visitor.last_seen = entry.timestamp;
            visitor.last_seen_value = timestampValue;
        }
    });

    const visitors = Array.from(grouped.values())
        .map((visitor) => {
            const topAgents = getTopCounts(visitor.agents, 3);
            const topBotReasons = getTopCounts(visitor.bot_reasons, 2);
            const isMixed = visitor.human_requests > 0 && visitor.bot_requests > 0;
            const isBotOnly = visitor.bot_requests > 0 && visitor.human_requests === 0;

            return {
                ip: visitor.ip,
                first_seen: visitor.first_seen,
                last_seen: visitor.last_seen,
                requests: visitor.requests,
                human_requests: visitor.human_requests,
                bot_requests: visitor.bot_requests,
                classification: isMixed ? 'Mixed' : isBotOnly ? 'Bot' : 'Human',
                agent: topAgents[0]?.value || 'Unknown',
                bot_reason: topBotReasons[0]?.value || null,
                paths: getTopCounts(visitor.paths, 5),
                methods: getTopCounts(visitor.methods, 4),
                statuses: getTopCounts(visitor.statuses, 4)
            };
        })
        .sort((left, right) => parseAccessLogTimestamp(right.last_seen) - parseAccessLogTimestamp(left.last_seen))
        .slice(0, limit);

    return {
        summary: {
            total_unique: grouped.size,
            human_unique: humanIps.size,
            bot_unique: botIps.size,
            mixed_unique: Array.from(grouped.values()).filter((visitor) => visitor.human_requests > 0 && visitor.bot_requests > 0).length,
            total_requests: totalRequests,
            human_requests: humanRequests,
            bot_requests: botRequests
        },
        visitors
    };
}

module.exports = {
    getAgentType,
    getBotReason,
    getRecentVisitors,
    getUniqueVisitors,
    isTargetAppLine,
    parseAccessLogTimestamp,
    parseNginxAccessLine,
    parseNginxLogMetrics
};
