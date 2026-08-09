const fs = require('fs');
const path = require('path');
const db = require('./database');
const {
    CLASSIFICATION_RULESET_VERSION,
    getAgentType,
    getBotReason,
    isPageView,
    isTargetAppLine,
    parseAccessLogTimestamp,
    parseNginxAccessLine
} = require('./logParser');

const INGEST_INTERVAL_MS = 30 * 1000;
const RETENTION_DAYS = 90;
const BACKFILL_DAYS = 30;
const BACKFILL_BYTES = 64 * 1024 * 1024;
const GEOIP_DB_PATH = process.env.GEOIP_DB_PATH || '/usr/share/GeoIP/GeoLite2-City.mmdb';

let geoReader = null;
let ingestTimer = null;

try {
    if (fs.existsSync(GEOIP_DB_PATH)) {
        const maxmind = require('maxmind');
        geoReader = new maxmind.Reader(fs.readFileSync(GEOIP_DB_PATH));
    }
} catch (error) {
    console.warn(`GeoIP disabled: ${error.message}`);
}

const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO visitor_events (
        app_id, source_file_id, source_offset, occurred_at, ip, method, path,
        status, referrer, host, user_agent, device_type, is_bot, bot_reason,
        is_page_view, country_code, region, city
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertState = db.prepare(`
    INSERT INTO visitor_ingestion_state (
        app_id, log_path, source_file_id, byte_offset, partial_line,
        last_ingested_at, backfill_complete
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(app_id) DO UPDATE SET
        log_path = excluded.log_path,
        source_file_id = excluded.source_file_id,
        byte_offset = excluded.byte_offset,
        partial_line = excluded.partial_line,
        last_ingested_at = CURRENT_TIMESTAMP,
        backfill_complete = excluded.backfill_complete
`);

function getFileId(stat) {
    return `${stat.dev || 0}:${stat.ino || 0}`;
}

function enrichLocation(ip) {
    if (!geoReader) return { countryCode: null, region: null, city: null };
    try {
        const result = geoReader.get(ip);
        return {
            countryCode: result?.country?.iso_code || null,
            region: result?.subdivisions?.[0]?.names?.he || result?.subdivisions?.[0]?.names?.en || null,
            city: result?.city?.names?.he || result?.city?.names?.en || null
        };
    } catch {
        return { countryCode: null, region: null, city: null };
    }
}

function ingestLine(app, line, sourceFileId, sourceOffset) {
    const entry = parseNginxAccessLine(line);
    if (!entry?.ip) return 0;
    if (!isTargetAppLine(line, app.name, app.log_filter, app.log_host, app.log_exclude, entry)) return 0;
    const timestamp = parseAccessLogTimestamp(entry.timestamp);
    if (!timestamp) return 0;

    const botReason = getBotReason(entry, line);
    const location = enrichLocation(entry.ip);
    return insertEvent.run(
        app.id,
        sourceFileId,
        sourceOffset,
        new Date(timestamp).toISOString(),
        entry.ip,
        entry.method,
        entry.path,
        entry.status,
        entry.referrer === '-' ? null : entry.referrer,
        entry.host,
        entry.userAgent,
        getAgentType(entry, line),
        botReason ? 1 : 0,
        botReason || null,
        isPageView(entry) ? 1 : 0,
        location.countryCode,
        location.region,
        location.city
    ).changes;
}

function ingestBuffer(app, buffer, sourceFileId, startOffset, initialPartial = '') {
    const content = initialPartial + buffer.toString('utf8');
    const lines = content.split('\n');
    const partialLine = lines.pop() || '';
    let offset = startOffset - Buffer.byteLength(initialPartial, 'utf8');
    let inserted = 0;

    const transaction = db.transaction(() => {
        lines.forEach((rawLine) => {
            const line = rawLine.replace(/\r$/, '');
            inserted += ingestLine(app, line, sourceFileId, offset);
            offset += Buffer.byteLength(rawLine, 'utf8') + 1;
        });
    });
    transaction();

    return { inserted, partialLine };
}

function ingestFileRange(app, filePath, sourceFileId, start, partial = '') {
    const stat = fs.statSync(filePath);
    if (stat.size <= start) return { inserted: 0, partialLine: partial, size: stat.size };
    const length = stat.size - start;
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, start);
        return { ...ingestBuffer(app, buffer, sourceFileId, start, partial), size: stat.size };
    } finally {
        fs.closeSync(fd);
    }
}

function findRotatedFile(logPath, sourceFileId) {
    const directory = path.dirname(logPath);
    const basename = path.basename(logPath);
    try {
        return fs.readdirSync(directory)
            .filter((name) => name === basename || name.startsWith(`${basename}.`))
            .map((name) => path.join(directory, name))
            .find((candidate) => {
                try { return fs.statSync(candidate).isFile() && getFileId(fs.statSync(candidate)) === sourceFileId; }
                catch { return false; }
            }) || null;
    } catch {
        return null;
    }
}

function initialBackfill(app, stat) {
    const bytesToRead = Math.min(stat.size, BACKFILL_BYTES);
    const start = stat.size - bytesToRead;
    const fd = fs.openSync(app.log_path, 'r');
    try {
        const buffer = Buffer.alloc(bytesToRead);
        fs.readSync(fd, buffer, 0, bytesToRead, start);
        let safeBuffer = buffer;
        let safeStart = start;
        if (start > 0) {
            const newline = buffer.indexOf(10);
            if (newline >= 0) {
                safeBuffer = buffer.subarray(newline + 1);
                safeStart += newline + 1;
            }
        }

        const cutoff = Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;
        const content = safeBuffer.toString('utf8');
        const lines = content.split('\n');
        let offset = safeStart;
        let inserted = 0;
        const transaction = db.transaction(() => {
            lines.forEach((rawLine) => {
                const line = rawLine.replace(/\r$/, '');
                const parsed = parseNginxAccessLine(line);
                if (parsed && parseAccessLogTimestamp(parsed.timestamp) >= cutoff) {
                    inserted += ingestLine(app, line, getFileId(stat), offset);
                }
                offset += Buffer.byteLength(rawLine, 'utf8') + 1;
            });
        });
        transaction();
        upsertState.run(app.id, app.log_path, getFileId(stat), stat.size, '', 1);
        return inserted;
    } finally {
        fs.closeSync(fd);
    }
}

function ingestApp(app) {
    if (!app.log_path || !fs.existsSync(app.log_path)) return 0;
    const stat = fs.statSync(app.log_path);
    const sourceFileId = getFileId(stat);
    const state = db.prepare('SELECT * FROM visitor_ingestion_state WHERE app_id = ?').get(app.id);

    if (!state?.backfill_complete) return initialBackfill(app, stat);

    let start = Number(state.byte_offset) || 0;
    let partial = state.partial_line || '';
    let inserted = 0;
    if (state.source_file_id !== sourceFileId) {
        const rotatedFile = findRotatedFile(app.log_path, state.source_file_id);
        if (rotatedFile) {
            const rotatedResult = ingestFileRange(app, rotatedFile, state.source_file_id, start, partial);
            inserted += rotatedResult.inserted;
        }
        start = 0;
        partial = '';
    } else if (stat.size < start) {
        start = 0;
        partial = '';
    }
    if (stat.size <= start) {
        upsertState.run(app.id, app.log_path, sourceFileId, stat.size, partial, 1);
        return inserted;
    }
    const result = ingestFileRange(app, app.log_path, sourceFileId, start, partial);
    upsertState.run(app.id, app.log_path, sourceFileId, result.size, result.partialLine, 1);
    return inserted + result.inserted;
}

function purgeExpiredEvents() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare('DELETE FROM visitor_events WHERE occurred_at < ?').run(cutoff).changes;
}

function refreshStoredEventClassifications() {
    const metadataKey = 'visitor_classification_ruleset';
    const current = db.prepare('SELECT value FROM monitor_metadata WHERE key = ?').get(metadataKey);
    if (current?.value === CLASSIFICATION_RULESET_VERSION) return { scanned: 0, updated: 0 };

    const rows = db.prepare(`
        SELECT id, method, path, status, user_agent, is_bot, bot_reason, is_page_view
        FROM visitor_events
    `).all();
    const update = db.prepare(`
        UPDATE visitor_events
        SET is_bot = ?, bot_reason = ?, is_page_view = ?
        WHERE id = ?
    `);
    let updated = 0;
    const transaction = db.transaction(() => {
        rows.forEach((row) => {
            const entry = {
                method: row.method,
                path: row.path,
                status: row.status,
                userAgent: row.user_agent
            };
            const addedReason = getBotReason(entry);
            const isBot = Boolean(row.is_bot || addedReason);
            const botReason = row.bot_reason || addedReason || null;
            const pageView = isPageView(entry) ? 1 : 0;
            if (Number(row.is_bot) !== Number(isBot) || row.bot_reason !== botReason || Number(row.is_page_view) !== pageView) {
                update.run(isBot ? 1 : 0, botReason, pageView, row.id);
                updated++;
            }
        });
        db.prepare(`
            INSERT INTO monitor_metadata (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(metadataKey, CLASSIFICATION_RULESET_VERSION);
    });
    transaction();
    return { scanned: rows.length, updated };
}

function runVisitorIngestion() {
    const apps = db.prepare("SELECT * FROM apps WHERE analytics_enabled = 1 AND log_path IS NOT NULL AND log_path != ''").all();
    let inserted = 0;
    apps.forEach((app) => {
        try {
            inserted += ingestApp(app);
        } catch (error) {
            console.error(`Visitor ingestion failed for ${app.name}:`, error.message);
        }
    });
    purgeExpiredEvents();
    return inserted;
}

function startVisitorIngestion() {
    if (ingestTimer) return;
    const refreshed = refreshStoredEventClassifications();
    if (refreshed.scanned) {
        console.log(`Visitor classification refreshed: ${refreshed.updated}/${refreshed.scanned} events updated.`);
    }
    setTimeout(runVisitorIngestion, 1500);
    ingestTimer = setInterval(runVisitorIngestion, INGEST_INTERVAL_MS);
}

module.exports = {
    BACKFILL_BYTES,
    BACKFILL_DAYS,
    RETENTION_DAYS,
    ingestApp,
    ingestBuffer,
    ingestFileRange,
    purgeExpiredEvents,
    refreshStoredEventClassifications,
    runVisitorIngestion,
    startVisitorIngestion
};
