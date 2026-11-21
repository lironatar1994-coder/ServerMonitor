const db = require('./database');

const landing = new Set([
    'landing-open', 'page-scroll', 'section-hero', 'section-ours', 'section-form', 'section-accounts', 'section-updates',
    'section-price', 'section-faq', 'section-about', 'section-closing', 'start-header', 'start-hero', 'start-price',
    'start-closing', 'start-sticky', 'nav-how', 'nav-price', 'nav-miluim', 'faq-toggle', 'video-toggle'
]);
const intake = new Set([
    'page-scroll', 'selection-open', 'details-open', 'next-details', 'back-selection', 'back-details', 'account-elec',
    'account-water', 'account-arnona', 'account-gas', 'address-toggle', 'change-address', 'edit-name', 'edit-phone',
    'edit-city', 'change-role', 'change-direction', 'invalid-name', 'invalid-phone', 'invalid-city', 'crm-sending',
    'crm-received', 'crm-unconfirmed', 'copy-message'
]);

function isAlenuJourney(app, path, label) {
    if (app.name !== 'Alenu') return false;
    if (/^\/(?:index\.html)?$/.test(path)) return landing.has(label);
    return /^\/start(?:\.html)?\/?$/.test(path) && intake.has(label);
}

function alenuJourneySummary(app, range) {
    if (app.name !== 'Alenu') throw Object.assign(new Error('Alenu journey is unavailable for this site'), { status: 404 });
    const counts = db.prepare(`WITH milestones AS (
        SELECT session_hash, CASE
            WHEN label='landing-open' THEN 1 WHEN label='selection-open' THEN 2 WHEN label='details-open' THEN 3
            WHEN label IN ('invalid-name','invalid-phone','invalid-city','crm-sending','crm-unconfirmed') THEN 4
            WHEN label='crm-received' THEN 5 END AS stage
        FROM growth_events WHERE app_id=? AND occurred_at>=? AND occurred_at<? AND automation_hint=0 AND event_type='alenu_journey'
    ), visits AS (
        SELECT session_hash, MAX(stage) AS furthest FROM milestones WHERE stage IS NOT NULL GROUP BY session_hash
    )
    SELECT stage, COUNT(DISTINCT milestones.session_hash) AS reached,
        COUNT(DISTINCT CASE WHEN visits.furthest=milestones.stage THEN visits.session_hash END) AS furthest
    FROM milestones JOIN visits USING (session_hash)
    WHERE stage IS NOT NULL GROUP BY stage ORDER BY stage`).all(app.id, range.from, range.to);
    return { range, stages: [1, 2, 3, 4, 5].map(stage => counts.find(row => row.stage === stage) || { stage, reached: 0, furthest: 0 }) };
}

module.exports = { isAlenuJourney, alenuJourneySummary };
