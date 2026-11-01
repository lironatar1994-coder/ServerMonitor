// Idempotent Alenu placement links and bounded local location enrichment of retained requests.
require('../backend/node_modules/dotenv').config({ path: '/root/ServerMonitor/backend/.env', quiet: true });
const db = require('../backend/database');
const fs = require('node:fs');
const path = process.env.GEOIP_DB_PATH || '/usr/share/GeoIP/GeoLite2-City.mmdb';
const app = db.prepare("SELECT id,url FROM apps WHERE name='Alenu'").get();
if (app) {
    const site = new URL(app.url);
    for (const [code,channel] of [['alenu-fb-page','facebook'],['alenu-fb-pinned','facebook'],['alenu-fb-post','facebook'],['alenu-fb-group','facebook'],['alenu-wa','whatsapp'],['alenu-fb-ad','facebook']]) {
        db.prepare('INSERT OR IGNORE INTO tracked_links(app_id,host,code,channel,campaign,path,created_by,created_at,medium) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(app.id,site.host,code,channel,'alenu-launch',site.pathname,'attribution-setup',new Date().toISOString(),code.endsWith('-ad')?'paid_social':channel==='whatsapp'?'messaging':'social');
    }
}
if (fs.existsSync(path)) {
    const reader = new (require('../backend/node_modules/maxmind').Reader)(fs.readFileSync(path));
    const rows = db.prepare('SELECT DISTINCT ip FROM visitor_events WHERE country_code IS NULL AND is_bot=0 AND is_page_view=1 LIMIT 10000').all();
    const update = db.prepare('UPDATE visitor_events SET country_code=?,region=?,city=? WHERE ip=? AND country_code IS NULL');
    let enriched = 0;
    db.transaction(() => {
        for (const {ip} of rows) {
            const geo = reader.get(ip);
            if (!geo?.country?.iso_code) continue;
            enriched += update.run(geo.country.iso_code,geo.subdivisions?.[0]?.names?.en || null,geo.city?.names?.en || null,ip).changes;
        }
    })();
    console.log(`Location enrichment: ${rows.length} addresses checked, ${enriched} retained requests enriched (approximate current location)`);
}
console.log('Attribution setup complete');
db.close();
