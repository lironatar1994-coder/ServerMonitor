const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'monitor-sources-'));
process.env.MONITOR_DB_PATH = path.join(temp, 'test.db');
process.env.NODE_ENV = 'test';
const db = require('../database');
const sources = require('../sources');

test.after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const app = (name) => db.prepare('SELECT * FROM apps WHERE name = ?').get(name);

test('campaign tags and referring hosts map to channels', () => {
    const cases = [['google.co.il', '', 'google'], ['l.facebook.com', '', 'facebook'], ['wa', '', 'whatsapp'], ['whatsapp', 'link', 'whatsapp'],
        ['l.instagram.com', '', 'instagram'], ['chatgpt.com', '', 'ai'], ['newsletter', '', 'email'], ['partner', 'email', 'email'],
        ['', '', 'direct'], ['blog.example.com', '', 'referral'], ['flyer', '', 'other'], ['t.co', '', 'x'], ['gbp', '', 'google_business']];
    for (const [source, medium, channel] of cases) assert.equal(sources.channelOf(source, medium), channel, source);
});

test('sessions per channel count contact clicks once and ignore automation', () => {
    const site = app('Alenu');
    const insert = db.prepare(`INSERT INTO growth_events (app_id, event_id, occurred_at, session_hash, event_type, path, source, medium, campaign, device, automation_hint)
        VALUES (?, ?, '2026-10-21T10:00:00Z', ?, ?, '/alenu/', ?, ?, ?, 'mobile', ?)`);
    insert.run(site.id, 'e1', 's1', 'page_view', 'whatsapp', 'link', 'סתיו', 0);
    insert.run(site.id, 'e2', 's1', 'contact_click', 'whatsapp', 'link', 'סתיו', 0);
    insert.run(site.id, 'e3', 's1', 'contact_click', 'whatsapp', 'link', 'סתיו', 0);
    insert.run(site.id, 'e4', 's2', 'page_view', 'google.com', '', '', 0);
    insert.run(site.id, 'e5', 's3', 'page_view', 'l.facebook.com', '', '', 1);
    const summary = sources.sourcesSummary(db, site.id, '2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z');
    assert.equal(summary.sessions, 2);
    assert.deepEqual(summary.channels.map((c) => [c.channel, c.sessions, c.contacts]), [['whatsapp', 1, 1], ['google', 1, 0]]);
    assert.equal(summary.campaigns[0].campaign, 'סתיו');
});

test('short links redirect only to their own site, tag the visit and count real clicks', () => {
    const site = app('LA webs');
    assert.equal(sources.suggestCode(db, site.id, 'whatsapp'), 'wa');
    const link = sources.validateLink(db, { app_id: site.id, channel: 'whatsapp', code: 'wa', campaign: '', path: '/' });
    db.prepare('INSERT INTO tracked_links (app_id, host, code, channel, campaign, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(site.id, link.host, link.code, link.channel, link.campaign, link.path, new Date().toISOString());
    assert.equal(sources.suggestCode(db, site.id, 'whatsapp'), 'wa2');
    assert.throws(() => sources.validateLink(db, { app_id: site.id, channel: 'whatsapp', code: 'wa', path: '/' }), /בשימוש/);
    assert.throws(() => sources.validateLink(db, { app_id: site.id, channel: 'whatsapp', code: 'ok', path: '//evil.example' }), /נתיב/);
    assert.equal(sources.resolveLink(db, 'lawebs.co.il', 'wa'), 'https://lawebs.co.il/?utm_source=whatsapp&utm_medium=link&utm_campaign=wa');
    assert.equal(sources.resolveLink(db, 'www.lawebs.co.il', 'WA'), 'https://lawebs.co.il/?utm_source=whatsapp&utm_medium=link&utm_campaign=wa');
    sources.resolveLink(db, 'lawebs.co.il', 'wa', { automated: true });
    sources.resolveLink(db, 'lawebs.co.il', 'wa', { internal: true });
    assert.equal(sources.resolveLink(db, 'lawebs.co.il', 'missing'), 'https://lawebs.co.il/');
    const [listed] = sources.listLinks(db, site.id);
    assert.equal(listed.short_url, 'https://lawebs.co.il/l/wa');
    assert.equal(listed.clicks, 2);
});
