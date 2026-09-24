function initializeGrowth(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS growth_profiles (
            app_id INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
            objective TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '',
            response_hours INTEGER NOT NULL DEFAULT 24, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS growth_goals (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            title TEXT NOT NULL, metric TEXT NOT NULL, target INTEGER NOT NULL DEFAULT 0,
            path TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, period_days INTEGER NOT NULL DEFAULT 30, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS growth_events (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL, occurred_at TEXT NOT NULL, session_hash TEXT NOT NULL,
            event_type TEXT NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '',
            device TEXT NOT NULL, automation_hint INTEGER NOT NULL DEFAULT 0,
            UNIQUE(app_id,event_id)
        );
        CREATE INDEX IF NOT EXISTS growth_events_range ON growth_events(app_id,occurred_at,automation_hint,event_type);
        CREATE TABLE IF NOT EXISTS growth_leads (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            reference TEXT NOT NULL, origin TEXT NOT NULL, external_key TEXT,
            occurred_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new', owner TEXT NOT NULL DEFAULT '', due_at TEXT,
            source_status TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '',
            value REAL, first_response_at TEXT, outcome_at TEXT, archived INTEGER NOT NULL DEFAULT 0,
            UNIQUE(app_id,origin,external_key)
        );
        CREATE INDEX IF NOT EXISTS growth_leads_range ON growth_leads(app_id,occurred_at,status);
        CREATE TABLE IF NOT EXISTS growth_tasks (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            title TEXT NOT NULL, hypothesis TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'planned',
            owner TEXT NOT NULL DEFAULT '', due_at TEXT, priority TEXT NOT NULL DEFAULT 'normal',
            path TEXT NOT NULL DEFAULT '', metric TEXT NOT NULL DEFAULT 'contact_click',
            evidence_key TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
        );
        CREATE INDEX IF NOT EXISTS growth_tasks_app ON growth_tasks(app_id,status);
        CREATE UNIQUE INDEX IF NOT EXISTS growth_tasks_evidence ON growth_tasks(app_id,evidence_key) WHERE evidence_key IS NOT NULL;
        CREATE TABLE IF NOT EXISTS growth_campaigns (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            name TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, landing_path TEXT NOT NULL,
            url TEXT NOT NULL, cost REAL, created_at TEXT NOT NULL,
            UNIQUE(app_id,name,source,medium)
        );
        CREATE TABLE IF NOT EXISTS growth_activity (
            id INTEGER PRIMARY KEY, app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
            occurred_at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL,
            entity_id INTEGER, summary TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS growth_activity_app ON growth_activity(app_id,occurred_at);
        CREATE TABLE IF NOT EXISTS growth_sources (
            app_id INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
            last_success_at TEXT, last_attempt_at TEXT NOT NULL, status TEXT NOT NULL,
            imported INTEGER NOT NULL DEFAULT 0, excluded INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT ''
        );
    `);
    if (!db.prepare('PRAGMA table_info(growth_goals)').all().some(c => c.name === 'period_days')) {
        db.exec('ALTER TABLE growth_goals ADD COLUMN period_days INTEGER NOT NULL DEFAULT 30');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS growth_campaign_name ON growth_campaigns(app_id,name)');
    for (const column of ['placement', 'project']) {
        if (!db.prepare('PRAGMA table_info(growth_events)').all().some(c => c.name === column)) {
            db.exec(`ALTER TABLE growth_events ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
        }
    }
    const now = new Date().toISOString();
    const descriptions = {
        'Dfus Reuven': 'בקשות להצעת מחיר לפי שירות', 'Pinhas Ratzon': 'פניות רלוונטיות לפי תחום שירות',
        'Libi Diamonds': 'התעניינות במוצרים ופניות', 'PDF Studio': 'השלמת פעולות והורדת תוצאה',
        'Koral Events': 'הרשמות לאירועים', 'Koral Events 2': 'הרשמות לאירועים',
        'On Your Way': 'פניות שירות וטיפול בהן', 'SOS Landing': 'יצירת קשר לקבלת שירות'
    };
    for (const app of db.prepare('SELECT id,name FROM apps WHERE analytics_enabled=1 AND reporting_enabled=1').all()) {
        const inserted = db.prepare('INSERT OR IGNORE INTO growth_profiles(app_id,objective,created_at) VALUES(?,?,?)')
            .run(app.id, descriptions[app.name] || 'פניות והתעניינות בשירותים', now);
        if (inserted.changes) db.prepare('INSERT INTO growth_goals(app_id,title,metric,created_at) VALUES(?,?,?,?)')
            .run(app.id, descriptions[app.name] || 'פעולות ליצירת קשר', app.name === 'PDF Studio' ? 'tool_completed' : 'lead_received', now);
    }
}
module.exports = { initializeGrowth };
