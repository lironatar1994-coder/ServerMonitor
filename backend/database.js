const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.MONITOR_DB_PATH || path.join(__dirname, 'monitor.db');
const db = new Database(dbPath, {
    verbose: process.env.DB_VERBOSE === 'true' ? console.log : undefined
});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT,
        pm2_name TEXT,
        log_path TEXT,
        status TEXT DEFAULT 'unknown',
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_alerted_at DATETIME,
        health_port INTEGER,
        health_path TEXT,
        log_filter TEXT,
        log_host TEXT,
        log_exclude TEXT,
        health_url TEXT,
        analytics_enabled INTEGER DEFAULT 1,
        reporting_enabled INTEGER DEFAULT 1,
        alerts_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER,
        visitors INTEGER DEFAULT 0,
        requests INTEGER DEFAULT 0,
        attacks INTEGER DEFAULT 0,
        cpu_usage REAL DEFAULT 0,
        ram_usage REAL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps (id)
    );

    CREATE TABLE IF NOT EXISTS visitor_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        source_file_id TEXT NOT NULL,
        source_offset INTEGER NOT NULL,
        occurred_at DATETIME NOT NULL,
        ip TEXT NOT NULL,
        method TEXT,
        path TEXT,
        status INTEGER,
        referrer TEXT,
        host TEXT,
        user_agent TEXT,
        device_type TEXT DEFAULT 'Unknown',
        is_bot INTEGER DEFAULT 0,
        bot_reason TEXT,
        is_page_view INTEGER DEFAULT 0,
        country_code TEXT,
        region TEXT,
        city TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, source_file_id, source_offset)
    );

    CREATE TABLE IF NOT EXISTS visitor_ingestion_state (
        app_id INTEGER PRIMARY KEY,
        log_path TEXT NOT NULL,
        source_file_id TEXT,
        byte_offset INTEGER DEFAULT 0,
        partial_line TEXT DEFAULT '',
        last_ingested_at DATETIME,
        backfill_complete INTEGER DEFAULT 0,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_report_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_type TEXT NOT NULL,
        period_key TEXT NOT NULL,
        recipient TEXT NOT NULL,
        provider_id TEXT,
        status TEXT NOT NULL,
        error TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (report_type, period_key, recipient)
    );

    CREATE TABLE IF NOT EXISTS monitor_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_time
        ON visitor_events (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_ip_time
        ON visitor_events (app_id, ip, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_bot_time
        ON visitor_events (app_id, is_bot, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
        ON metrics (timestamp);
`);

// Insert default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
    console.log('Default admin user created (admin/admin123)');
}

// Programmatic Migrations for schema updates
try {
    db.exec(`ALTER TABLE apps ADD COLUMN last_alerted_at DATETIME`);
    console.log('Added column last_alerted_at to apps table');
} catch (e) {
    // Column already exists or table doesn't exist
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN health_port INTEGER`);
    console.log('Added column health_port to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN health_path TEXT`);
    console.log('Added column health_path to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN log_filter TEXT`);
    console.log('Added column log_filter to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN log_host TEXT`);
    console.log('Added column log_host to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN log_exclude TEXT`);
    console.log('Added column log_exclude to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE visitor_events ADD COLUMN host TEXT`);
    console.log('Added column host to visitor_events table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE visitor_events ADD COLUMN is_page_view INTEGER DEFAULT 0`);
    console.log('Added column is_page_view to visitor_events table');
} catch (e) {
    // Column already exists
}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_page_time
        ON visitor_events (app_id, is_bot, is_page_view, occurred_at DESC);
`);

try {
    db.exec(`ALTER TABLE apps ADD COLUMN health_url TEXT`);
    console.log('Added column health_url to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN analytics_enabled INTEGER DEFAULT 1`);
    console.log('Added column analytics_enabled to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN reporting_enabled INTEGER DEFAULT 1`);
    console.log('Added column reporting_enabled to apps table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE apps ADD COLUMN alerts_enabled INTEGER DEFAULT 1`);
    console.log('Added column alerts_enabled to apps table');
} catch (e) {
    // Column already exists
}

const sharedNginxLog = '/var/log/nginx/monitor_host_access.log';
const veeExcludedPaths = [
    '/text-to-pdf', '/serve-monitor', '/pixel-dungeon', '/OnYourWay', '/onyourway',
    '/Manager_Site', '/manager_site', '/Miryam_Zelig', '/miryam_zelig', '/miryamzelig2',
    '/DfusReuven', '/dfusreuven', '/sos', '/LibiDiamonds2'
].join('|');

const productionApps = [
    { name: 'Vee Main App', url: 'https://vee-app.co.il/', pm2_name: 'vee-app', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_exclude: veeExcludedPaths, health_url: 'http://127.0.0.1:3001/api/health', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'WhatsApp Worker', pm2_name: 'vee-whatsapp-worker', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'SSH Security', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'PDF Generator', url: 'https://vee-app.co.il/text-to-pdf', pm2_name: 'text-to-pdf', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/text-to-pdf', health_url: 'http://127.0.0.1:3002/text-to-pdf', analytics_enabled: 1, reporting_enabled: 0 },
    { name: 'Pixel Dungeon', url: 'https://vee-app.co.il/pixel-dungeon/', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/pixel-dungeon', health_url: 'https://vee-app.co.il/pixel-dungeon/', analytics_enabled: 1, reporting_enabled: 0 },
    { name: 'SOS Landing', url: 'https://sosbaderech.co.il/', pm2_name: 'sos-landing-standalone', log_path: sharedNginxLog, log_host: 'sosbaderech.co.il|www.sosbaderech.co.il', health_url: 'http://127.0.0.1:3200/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Cleanup Summary', log_path: '/var/log/server_cleanup_summary.log', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Miryam Zelig', url: 'https://miryamzelig.co.il/', log_path: sharedNginxLog, log_host: 'miryamzelig.co.il|www.miryamzelig.co.il', health_url: 'https://miryamzelig.co.il/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Libi Diamonds', url: 'https://www.libidiamonds.co.il/', pm2_name: 'libi-diamonds-live', log_path: sharedNginxLog, log_host: 'libidiamonds.co.il|www.libidiamonds.co.il', health_url: 'http://127.0.0.1:3105/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Server Monitor', url: 'https://monitor.vee-app.co.il/', pm2_name: 'server-monitor', health_url: 'http://127.0.0.1:4010/serve-monitor/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Manager Site', url: 'https://vee-app.co.il/Manager_Site/', pm2_name: 'manager-site', health_url: 'http://127.0.0.1:3027/Manager_Site/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'On Your Way', url: 'https://vee-app.co.il/OnYourWay', pm2_name: 'on-your-way-frontend', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/OnYourWay|/onyourway', health_url: 'http://127.0.0.1:3101/OnYourWay', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'On Your Way API', pm2_name: 'on-your-way-backend', health_url: 'http://127.0.0.1:3004/health', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Dfus Reuven Preview', url: 'https://vee-app.co.il/DfusReuven', pm2_name: 'dfus-reuven', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/DfusReuven|/dfusreuven', health_url: 'http://127.0.0.1:3104/DfusReuven', analytics_enabled: 1, reporting_enabled: 0 },
    { name: 'Dfus Reuven', url: 'https://www.dfusreuven.co.il/', pm2_name: 'dfus-reuven-live', log_path: sharedNginxLog, log_host: 'dfusreuven.co.il|www.dfusreuven.co.il', health_url: 'http://127.0.0.1:3106/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Miryam Zelig Preview', url: 'https://vee-app.co.il/miryamzelig2/', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/miryamzelig2|/Miryam_Zelig|/miryam_zelig', health_url: 'https://vee-app.co.il/miryamzelig2/', analytics_enabled: 1, reporting_enabled: 0 },
    { name: 'Toren Hazak', url: 'https://63.250.61.126.sslip.io/', health_url: 'https://63.250.61.126.sslip.io/', analytics_enabled: 0, reporting_enabled: 0, alerts_enabled: 0 }
];

function syncProductionApps() {
    const fields = ['url', 'pm2_name', 'log_path', 'health_port', 'health_path', 'log_filter', 'log_host', 'log_exclude', 'health_url', 'analytics_enabled', 'reporting_enabled', 'alerts_enabled'];
    const findApp = db.prepare('SELECT * FROM apps WHERE name = ? ORDER BY id ASC LIMIT 1');
    const insertApp = db.prepare(`INSERT INTO apps
        (name, url, pm2_name, log_path, health_port, health_path, log_filter, log_host, log_exclude, health_url, analytics_enabled, reporting_enabled, alerts_enabled)
        VALUES (@name, @url, @pm2_name, @log_path, @health_port, @health_path, @log_filter, @log_host, @log_exclude, @health_url, @analytics_enabled, @reporting_enabled, @alerts_enabled)`);
    const updateApp = db.prepare(`UPDATE apps SET
        url = @url, pm2_name = @pm2_name, log_path = @log_path, health_port = @health_port,
        health_path = @health_path, log_filter = @log_filter, log_host = @log_host,
        log_exclude = @log_exclude, health_url = @health_url,
        analytics_enabled = @analytics_enabled, reporting_enabled = @reporting_enabled,
        alerts_enabled = @alerts_enabled WHERE id = @id`);
    const clearEvents = db.prepare('DELETE FROM visitor_events WHERE app_id = ?');
    const clearState = db.prepare('DELETE FROM visitor_ingestion_state WHERE app_id = ?');

    db.transaction(() => {
        productionApps.forEach((definition) => {
            const normalized = Object.fromEntries(fields.map((field) => [field,
                definition[field] ?? (['analytics_enabled', 'reporting_enabled', 'alerts_enabled'].includes(field) ? 1 : null)]));
            const existing = findApp.get(definition.name);
            if (!existing) {
                insertApp.run({ name: definition.name, ...normalized });
                console.log(`Created production app monitor: ${definition.name}`);
                return;
            }

            const visitorConfigChanged = ['log_path', 'log_filter', 'log_host', 'log_exclude', 'analytics_enabled']
                .some((field) => (existing[field] ?? null) !== (normalized[field] ?? null));
            if (visitorConfigChanged) {
                clearEvents.run(existing.id);
                clearState.run(existing.id);
                console.log(`Reset visitor ingestion after configuration change: ${definition.name}`);
            }
            updateApp.run({ id: existing.id, ...normalized });
        });
    })();
}

syncProductionApps();

module.exports = db;
