const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.MONITOR_DB_PATH || path.join(__dirname, 'monitor.db');
const db = new Database(dbPath, { verbose: process.env.NODE_ENV === 'test' ? undefined : console.log });
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
        log_filter TEXT
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
        user_agent TEXT,
        device_type TEXT DEFAULT 'Unknown',
        is_bot INTEGER DEFAULT 0,
        bot_reason TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_time
        ON visitor_events (app_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_ip_time
        ON visitor_events (app_id, ip, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_visitor_events_app_bot_time
        ON visitor_events (app_id, is_bot, occurred_at DESC);
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

// Insert Pixel Dungeon app if not exists
const pdExists = db.prepare('SELECT id FROM apps WHERE name = ?').get('Pixel Dungeon');
if (!pdExists) {
    db.prepare('INSERT INTO apps (name, url, pm2_name, log_path, log_filter) VALUES (?, ?, ?, ?, ?)').run(
        'Pixel Dungeon',
        'https://vee-app.co.il/pixel-dungeon/',
        null,
        '/var/log/nginx/access.log',
        '/pixel-dungeon/'
    );
    console.log('Pixel Dungeon app entry created in database.');
}

// Insert Miryam Zelig static site if not exists
const miryamExists = db.prepare('SELECT id FROM apps WHERE name = ?').get('Miryam Zelig');
if (!miryamExists) {
    db.prepare('INSERT INTO apps (name, url, pm2_name, log_path, log_filter) VALUES (?, ?, ?, ?, ?)').run(
        'Miryam Zelig',
        'https://vee-app.co.il/Miryam_Zelig/',
        null,
        '/var/log/nginx/access.log',
        '/Miryam_Zelig|/miryam_zelig'
    );
    console.log('Miryam Zelig app entry created in database.');
}

module.exports = db;
