const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.MONITOR_DB_PATH || path.join(__dirname, 'monitor.db');
const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV !== 'production' && process.env.DB_VERBOSE === 'true' ? console.log : undefined
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
        bot_classification TEXT DEFAULT 'candidate',
        bot_confidence INTEGER DEFAULT 0,
        is_page_view INTEGER DEFAULT 0,
        country_code TEXT,
        region TEXT,
        city TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, source_file_id, source_offset)
    );

    CREATE TABLE IF NOT EXISTS browser_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip TEXT NOT NULL,
        visitor_hash TEXT NOT NULL,
        session_hash TEXT NOT NULL,
        path TEXT NOT NULL,
        user_agent TEXT,
        automation_hint INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS engagement_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        session_hash TEXT NOT NULL,
        path TEXT NOT NULL,
        scroll_depth INTEGER NOT NULL,
        dwell_ms INTEGER DEFAULT 0,
        viewport_width INTEGER,
        automation_hint INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS engagement_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        path TEXT NOT NULL,
        zone TEXT NOT NULL,
        taps INTEGER NOT NULL DEFAULT 1,
        automation_hint INTEGER DEFAULT 0,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id, zone)
    );

    CREATE TABLE IF NOT EXISTS engagement_zone_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        path TEXT NOT NULL,
        zone TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 1,
        dwell_ms INTEGER NOT NULL DEFAULT 0,
        automation_hint INTEGER DEFAULT 0,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id, zone)
    );

    CREATE TABLE IF NOT EXISTS engagement_heatmap_cells (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        path TEXT NOT NULL,
        viewport_class TEXT NOT NULL,
        cell_x INTEGER NOT NULL,
        cell_y INTEGER NOT NULL,
        taps INTEGER NOT NULL DEFAULT 1,
        automation_hint INTEGER DEFAULT 0,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id, viewport_class, cell_x, cell_y)
    );

    CREATE TABLE IF NOT EXISTS product_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        visitor_hash TEXT NOT NULL,
        session_hash TEXT NOT NULL,
        path TEXT NOT NULL,
        event_type TEXT NOT NULL,
        label TEXT NOT NULL,
        value INTEGER,
        automation_hint INTEGER DEFAULT 0,
        FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
        UNIQUE (app_id, event_id)
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
    CREATE INDEX IF NOT EXISTS idx_browser_signals_app_time
        ON browser_signals (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_browser_signals_app_visitor_time
        ON browser_signals (app_id, visitor_hash, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_signals_app_time
        ON engagement_signals (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_zones_app_time
        ON engagement_zones (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_zone_views_app_time
        ON engagement_zone_views (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_heatmap_app_time
        ON engagement_heatmap_cells (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_events_app_time
        ON product_events (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_events_app_type_time
        ON product_events (app_id, event_type, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp
        ON metrics (timestamp);
`);

// Insert default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists && process.env.MONITOR_BOOTSTRAP_PASSWORD) {
    if (process.env.MONITOR_BOOTSTRAP_PASSWORD.length < 15) throw new Error('MONITOR_BOOTSTRAP_PASSWORD must contain at least 15 characters');
    const hash = bcrypt.hashSync(process.env.MONITOR_BOOTSTRAP_PASSWORD, 12);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
    console.log('Initial administrator created from explicit bootstrap configuration');
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

try {
    db.exec(`ALTER TABLE visitor_events ADD COLUMN bot_classification TEXT DEFAULT 'candidate'`);
    console.log('Added column bot_classification to visitor_events table');
} catch (e) {
    // Column already exists
}

try {
    db.exec(`ALTER TABLE visitor_events ADD COLUMN bot_confidence INTEGER DEFAULT 0`);
    console.log('Added column bot_confidence to visitor_events table');
} catch (e) {
    // Column already exists
}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_page_time
        ON visitor_events (app_id, is_bot, is_page_view, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_time ON visitor_events (occurred_at);
    CREATE INDEX IF NOT EXISTS idx_visitor_candidate_ip_time
        ON visitor_events (ip, occurred_at) WHERE is_bot = 0 AND is_page_view = 1;
    CREATE INDEX IF NOT EXISTS idx_visitor_candidate_app_ip_time
        ON visitor_events (app_id, ip, occurred_at) WHERE is_bot = 0 AND is_page_view = 1;
    CREATE INDEX IF NOT EXISTS idx_browser_signals_app_time
        ON browser_signals (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_browser_signals_app_visitor_time
        ON browser_signals (app_id, visitor_hash, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_signals_app_time
        ON engagement_signals (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_zones_app_time
        ON engagement_zones (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_zone_views_app_time
        ON engagement_zone_views (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engagement_heatmap_app_time
        ON engagement_heatmap_cells (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_events_app_time
        ON product_events (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_events_app_type_time
        ON product_events (app_id, event_type, occurred_at DESC);
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

if (!db.pragma('table_info(apps)').some((column) => column.name === 'systemd_unit')) {
    db.exec('ALTER TABLE apps ADD COLUMN systemd_unit TEXT');
}

const sharedNginxLog = '/var/log/nginx/monitor_host_access.log';
const veeExcludedPaths = [
    '/text-to-pdf', '/pdf-studio', '/serve-monitor', '/pixel-dungeon', '/OnYourWay', '/onyourway',
    '/Manager_Site', '/manager_site', '/Miryam_Zelig', '/miryam_zelig', '/miryamzelig2',
    '/DfusReuven', '/dfusreuven', '/sos', '/LibiDiamonds2', '/libidiamonds2', '/maavar'
].join('|');

// Other lawebs.co.il applications own these path segments; keep them out of the
// LA webs portfolio. Each exclusion matches a whole path segment (`/cv` is not `/cv-manager`).
const lawebsExcludedPaths = [
    '/seder', '/Koralevents', '/koralevents', '/Koralevents2', '/PinhasRatzon', '/pinhasratzon',
    '/alenu', '/alenu-crm', '/cv', '/cv-manager', '/desk', '/allsee', '/videos', '/rc',
    '/PizzaManager', '/pdf-studio', '/maavar'
].join('|');

const productionApps = [
    { name: 'LA webs', url: 'https://lawebs.co.il/', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_exclude: lawebsExcludedPaths, health_url: 'https://lawebs.co.il/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Pinhas Ratzon', url: 'https://pinhasratzon.co.il/', log_path: sharedNginxLog, log_host: 'pinhasratzon.co.il|www.pinhasratzon.co.il', health_url: 'https://pinhasratzon.co.il/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Pinhas Ratzon Form', pm2_name: 'pinhas-ratzon-form', health_url: 'http://127.0.0.1:3108/health', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Koral Events', url: 'https://lawebs.co.il/Koralevents', systemd_unit: 'koralevents2.service', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/Koralevents|/koralevents', health_url: 'http://127.0.0.1:3111/Koralevents', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Koral Events 2', url: 'https://lawebs.co.il/Koralevents2', systemd_unit: 'koralevents.service', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/Koralevents2', health_url: 'http://127.0.0.1:3110/Koralevents2', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Alenu', url: 'https://lawebs.co.il/alenu/', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/alenu', health_url: 'https://lawebs.co.il/alenu/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Mila Tova CV', url: 'https://lawebs.co.il/cv/', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/cv', health_url: 'https://lawebs.co.il/cv/', analytics_enabled: 1, reporting_enabled: 1 },
    // Storefronts only; kitchen/admin/platform routes stay outside visitor analytics.
    { name: 'Pizza Manager', url: 'https://lawebs.co.il/PizzaManager/', systemd_unit: 'pizza-manager-platform.service', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/PizzaManager/p', health_url: 'http://127.0.0.1:4180/PizzaManager/p/oven-demo/', analytics_enabled: 1, reporting_enabled: 0 },
    { name: 'Alenu CRM', url: 'https://lawebs.co.il/alenu-crm', systemd_unit: 'maavar.service', health_url: 'http://127.0.0.1:3127/alenu-crm/api/health', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Alenu CRM Worker', systemd_unit: 'maavar-worker.service', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'CV Manager', url: 'https://lawebs.co.il/cv-manager', systemd_unit: 'cv-manager.service', health_url: 'http://127.0.0.1:3139/cv-manager', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Desk', url: 'https://lawebs.co.il/desk/', systemd_unit: 'desk.service', health_url: 'http://127.0.0.1:3150/desk/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'AllSee', url: 'https://lawebs.co.il/allsee/', systemd_unit: 'allsee.service', health_url: 'http://127.0.0.1:4310/allsee/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Video Library', url: 'https://lawebs.co.il/videos/', pm2_name: 'video-library-api', health_url: 'http://127.0.0.1:3192/videos/api/health', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Claude RC', url: 'https://lawebs.co.il/rc/', pm2_name: 'claude-rc', health_url: 'http://127.0.0.1:3193/rc/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'PostgreSQL', systemd_unit: 'postgresql@16-main.service', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Seder WhatsApp', pm2_name: 'seder-whatsapp', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Seder Calendar', pm2_name: 'seder-calendar', analytics_enabled: 0, reporting_enabled: 0 },
    // The Vee application was retired on 2026-10-20; its static landing page remains.
    { name: 'Vee Landing', url: 'https://vee-app.co.il/', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_exclude: veeExcludedPaths, health_url: 'https://vee-app.co.il/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'SSH Security', analytics_enabled: 0, reporting_enabled: 0 },
    // PDF Studio moved to lawebs.co.il on 2026-10-15; the old vee-app path redirects there.
    { name: 'PDF Studio', url: 'https://lawebs.co.il/pdf-studio/', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il|vee-app.co.il|www.vee-app.co.il', log_filter: '/pdf-studio', health_url: 'https://lawebs.co.il/pdf-studio/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'SOS Landing', url: 'https://sosbaderech.co.il/', pm2_name: 'sos-landing-standalone', log_path: sharedNginxLog, log_host: 'sosbaderech.co.il|www.sosbaderech.co.il', health_url: 'http://127.0.0.1:3200/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Cleanup Summary', log_path: '/var/log/server_cleanup_summary.log', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Miryam Zelig', url: 'https://miryamzelig.co.il/', log_path: sharedNginxLog, log_host: 'miryamzelig.co.il|www.miryamzelig.co.il', health_url: 'https://miryamzelig.co.il/', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Seder', url: 'https://lawebs.co.il/seder', pm2_name: 'seder-live', log_path: sharedNginxLog, log_host: 'lawebs.co.il|www.lawebs.co.il', log_filter: '/seder', health_url: 'http://127.0.0.1:3107/seder', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Server Monitor', url: 'https://monitor.vee-app.co.il/', pm2_name: 'server-monitor', health_url: 'http://127.0.0.1:4010/serve-monitor/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Manager Site', url: 'https://vee-app.co.il/Manager_Site/', pm2_name: 'manager-site', health_url: 'http://127.0.0.1:3027/Manager_Site/', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'On Your Way', url: 'https://vee-app.co.il/OnYourWay', pm2_name: 'on-your-way-frontend', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/OnYourWay|/onyourway', health_url: 'http://127.0.0.1:3101/OnYourWay', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'On Your Way API', pm2_name: 'on-your-way-backend', health_url: 'http://127.0.0.1:3004/health', analytics_enabled: 0, reporting_enabled: 0 },
    { name: 'Dfus Reuven', url: 'https://www.dfusreuven.co.il/', pm2_name: 'dfus-reuven-live', log_path: sharedNginxLog, log_host: 'dfusreuven.co.il|www.dfusreuven.co.il', health_url: 'http://127.0.0.1:3106/api/health', analytics_enabled: 1, reporting_enabled: 1 },
    { name: 'Miryam Zelig Preview', url: 'https://vee-app.co.il/Miryam_Zelig/', log_path: sharedNginxLog, log_host: 'vee-app.co.il|www.vee-app.co.il', log_filter: '/miryamzelig2|/Miryam_Zelig|/miryam_zelig', health_url: 'https://vee-app.co.il/miryamzelig2/', analytics_enabled: 1, reporting_enabled: 0 },
];

// Renames keep the record ID, history and client work of an existing app.
const renamedProductionApps = { 'Maavar': 'Alenu CRM', 'Maavar Worker': 'Alenu CRM Worker', 'Vee Main App': 'Vee Landing' };
// Libi Diamonds (live and preview), the Dfus preview, the Vee application and its
// WhatsApp worker were removed from production on 2026-10-20 (archives in /root/retired-20261020).
const retiredProductionApps = ['Pixel Dungeon', 'PDF Generator', 'ToDoFast (inactive)', 'Toren Hazak',
    'Libi Diamonds', 'Libi Diamonds Preview', 'Dfus Reuven Preview', 'WhatsApp Worker'];

function renameProductionApps() {
    const rename = db.prepare('UPDATE apps SET name = ? WHERE name = ? AND NOT EXISTS (SELECT 1 FROM apps WHERE name = ?)');
    for (const [from, to] of Object.entries(renamedProductionApps)) {
        if (rename.run(to, from, to).changes) console.log(`Renamed production app monitor: ${from} -> ${to}`);
    }
}

function purgeRetiredProductionApps() {
    const findApps = db.prepare('SELECT id FROM apps WHERE name = ?');
    const deleteMetrics = db.prepare('DELETE FROM metrics WHERE app_id = ?');
    const deleteApp = db.prepare('DELETE FROM apps WHERE id = ?');

    db.transaction(() => {
        retiredProductionApps.forEach((name) => {
            const retiredApps = findApps.all(name);
            retiredApps.forEach(({ id }) => {
                deleteMetrics.run(id);
                deleteApp.run(id);
            });
            if (retiredApps.length) console.log(`Purged retired production app monitor: ${name}`);
        });
    })();
}

function splitPaths(value) {
    return (value || '').split('|').map((part) => part.trim().replace(/\/$/, '')).filter(Boolean);
}

function onlyAddedExclusions(existing, next) {
    const same = ['log_path', 'log_filter', 'log_host', 'analytics_enabled'].every((field) => (existing[field] ?? null) === (next[field] ?? null));
    const before = splitPaths(existing.log_exclude);
    const after = splitPaths(next.log_exclude);
    const added = after.filter((item) => !before.includes(item));
    return same && added.length && before.every((item) => after.includes(item)) ? added : null;
}

function syncProductionApps() {
    const fields = ['url', 'systemd_unit', 'pm2_name', 'log_path', 'health_port', 'health_path', 'log_filter', 'log_host', 'log_exclude', 'health_url', 'analytics_enabled', 'reporting_enabled', 'alerts_enabled'];
    const findApp = db.prepare('SELECT * FROM apps WHERE name = ? ORDER BY id ASC LIMIT 1');
    const insertApp = db.prepare(`INSERT INTO apps
        (name, url, systemd_unit, pm2_name, log_path, health_port, health_path, log_filter, log_host, log_exclude, health_url, analytics_enabled, reporting_enabled, alerts_enabled)
        VALUES (@name, @url, @systemd_unit, @pm2_name, @log_path, @health_port, @health_path, @log_filter, @log_host, @log_exclude, @health_url, @analytics_enabled, @reporting_enabled, @alerts_enabled)`);
    const updateApp = db.prepare(`UPDATE apps SET
        url = @url, systemd_unit = @systemd_unit, pm2_name = @pm2_name, log_path = @log_path, health_port = @health_port,
        health_path = @health_path, log_filter = @log_filter, log_host = @log_host,
        log_exclude = @log_exclude, health_url = @health_url,
        analytics_enabled = @analytics_enabled, reporting_enabled = @reporting_enabled,
        alerts_enabled = @alerts_enabled WHERE id = @id`);
    const clearEvents = db.prepare('DELETE FROM visitor_events WHERE app_id = ?');
    const clearState = db.prepare('DELETE FROM visitor_ingestion_state WHERE app_id = ?');
    // Server events plus every browser table that records the page path.
    const pathTables = ['visitor_events', 'browser_signals', 'growth_events', 'engagement_signals', 'engagement_zones', 'engagement_zone_views', 'engagement_heatmap_cells'];
    const existingTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const deleteExcluded = pathTables.filter((table) => existingTables.has(table)).map((table) => db.prepare(`DELETE FROM ${table} WHERE app_id = ? AND (path = ? OR substr(path, 1, ?) = ?)`));

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
            const addedExclusions = onlyAddedExclusions(existing, normalized);
            if (addedExclusions) {
                // Narrowing ownership removes only the newly excluded paths and keeps the rest of the history.
                const removed = addedExclusions.reduce((total, prefix) => total + deleteExcluded.reduce((sum, statement) => sum
                    + statement.run(existing.id, prefix, prefix.length + 1, prefix + '/').changes, 0), 0);
                console.log(`Removed ${removed} records now owned by other apps: ${definition.name}`);
            } else if (visitorConfigChanged) {
                clearEvents.run(existing.id);
                clearState.run(existing.id);
                console.log(`Reset visitor ingestion after configuration change: ${definition.name}`);
            }
            updateApp.run({ id: existing.id, ...normalized });
        });
    })();
}

renameProductionApps();
purgeRetiredProductionApps();
syncProductionApps();
require('./growthSchema').initializeGrowth(db);

module.exports = db;
