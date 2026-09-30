const BASE = 'https://monitor.vee-app.co.il/serve-monitor';
const n = value => new Intl.NumberFormat('he-IL').format(Number(value) || 0);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const date = value => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
const status = value => value === 'online' ? 'תקין' : value === 'unknown' || !value ? 'טרם נבדק' : 'דורש בדיקה';
const linkStyle = 'color:#006775;text-decoration:underline';
const muted = 'color:#43565F;font-size:11px;line-height:1.5';
const rule = 'border-top:1px solid #BAC8CE';

function siteUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
}
function periodLabel(from, to) {
    const start = date(from), end = date(new Date(new Date(to).getTime() - 1));
    return start === end ? start : `${start}–${end}`;
}
function reportLink(row, period, operational = false) {
    const id = Number(row.id);
    const route = operational ? 'services' : 'visitors';
    const suffix = Number.isSafeInteger(id) && id > 0 ? `/${id}` : '';
    return `${BASE}/${route}${suffix}${operational ? '' : `?${new URLSearchParams({ from: period.from, to: period.to })}`}`;
}
function change(current, previous) {
    const a = Number(current) || 0, b = Number(previous) || 0;
    if (a === b) return 'ללא שינוי';
    if (!b) return 'חדש';
    const delta = a - b;
    // Small comparison samples do not justify percentage headlines.
    return `${delta > 0 ? '+' : '−'}${n(Math.abs(delta))}${b >= 30 ? ` (${Math.round(Math.abs(delta) / b * 100)}%)` : ''}`;
}
function measurementNote(row) {
    if (!row.browserSignalPageViews) return row.pageViews > 0 ? 'מדידה חסרה' : 'ללא תנועה שנרשמה';
    return row.browserSignalSessions < 30 ? 'מדגם קטן' : '';
}
function jewelryNotes(row) {
    const notes = [];
    const product = row.jewelryInterest?.summary?.top_product;
    if (product) notes.push(`התכשיט הנצפה ביותר: ${product.name} · ${n(product.page_views)} צפיות שרת`);
    const collection = row.jewelryInterest?.summary?.top_collection;
    if (collection) notes.push(`קטגוריה מובילה: ${collection.label}`);
    return notes;
}
function checked(value) {
    if (!value) return 'טרם נבדק';
    const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? 'מועד לא ידוע' : new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(parsed);
}
function renderEmail(type, period, rows, operations = []) {
    const title = type === 'daily' ? 'דוח אתרים יומי' : 'דוח אתרים שבועי';
    const label = periodLabel(period.from, period.to);
    const comparison = periodLabel(period.previousFrom, period.from);
    const orderedRows = [...rows].sort((a, b) => b.browserSignalSessions - a.browserSignalSessions || b.pageViews - a.pageViews || a.name.localeCompare(b.name));
    const totalVisits = rows.reduce((sum, row) => sum + (Number(row.browserSignalSessions) || 0), 0);
    const previousVisits = rows.reduce((sum, row) => sum + (Number(row.previousBrowserSignalSessions) || 0), 0);
    const totalContacts = rows.reduce((sum, row) => sum + (Number(row.contactClicks) || 0), 0);
    const orderedOps = [...operations].sort((a, b) => Number(a.status === 'online') - Number(b.status === 'online') || a.name.localeCompare(b.name));
    const attention = orderedOps.filter(app => app.status !== 'online');
    const caveat = 'המבקרים הם הערכה, לא אנשים מזוהים; הסכומים הם לפי אתר. לחיצות ליצירת קשר אינן פניות שהתקבלו. ייתכן שתיכלל אוטומציה שלא זוהתה.';
    const measurementHelp = 'מדגם קטן: פחות מ־30 ביקורים; מוקדם להסיק מגמה. מדידה חסרה: נרשמו עמודים בשרת ללא ביקורים שנמדדו. היעדר תנועה אינו מעיד לבדו על תקלה.';
    const summary = `${n(rows.length)} אתרים · ${n(totalVisits)} ביקורים שנמדדו · ${n(totalContacts)} לחיצות קשר`;
    const metricCell = (value, extra = '', primary = false) => `<td class="rule" align="center" valign="top" style="padding:14px 3px;${rule}"><strong dir="ltr" style="display:block;font-size:${primary ? 22 : 18}px;line-height:1.35;font-weight:${primary ? 700 : 400}">${esc(value)}</strong>${extra ? `<span class="muted" style="display:block;margin-top:4px;${muted}">${extra}</span>` : ''}</td>`;
    const siteRows = orderedRows.map(row => {
        const note = measurementNote(row);
        const missing = !row.browserSignalPageViews && row.pageViews > 0;
        const contact = Number(row.contactClicks) > 0 ? `<span class="muted" style="display:block;margin-top:4px;${muted}">${n(row.contactClicks)} לחיצות קשר</span>` : '';
        const detail = jewelryNotes(row);
        return `<tr><th class="rule" scope="row" align="right" valign="top" style="padding:14px 6px 14px 0;${rule};font-weight:400;overflow-wrap:anywhere"><a class="link" href="${esc(reportLink(row, period))}" dir="auto" style="${linkStyle};font-size:14px;font-weight:700;line-height:1.45">${esc(row.name)}</a>${contact}${note ? `<span class="muted" style="display:block;margin-top:4px;${muted}">${esc(note)}</span>` : ''}</th>
${metricCell(missing ? '—' : n(row.browserSignalVisitors))}${metricCell(missing ? '—' : n(row.browserSignalSessions), missing ? '' : `<span dir="auto">${esc(change(row.browserSignalSessions, row.previousBrowserSignalSessions))}</span>`, true)}${metricCell(missing ? '—' : n(row.browserSignalPageViews))}</tr>
${detail.length ? `<tr><td colspan="4" class="muted" style="padding:0 0 14px;color:#43565F;font-size:12px;line-height:1.6">${detail.map(esc).join('<br>')}${siteUrl(row.url) ? `<br><a class="link" href="${esc(siteUrl(row.url))}" style="${linkStyle}">לאתר ${esc(row.name)}</a>` : ''}</td></tr>` : ''}`;
    }).join('');
    const operationsHtml = operations.length ? `<h2 style="font-size:16px;margin:28px 0 6px">מצב האתרים והשירותים</h2><p class="muted" style="font-size:12px;color:#43565F;margin:0 0 12px;line-height:1.6">הבדיקה האחרונה בלבד · שעון ישראל</p>
<table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px"><thead><tr><th scope="col" align="right" width="44%" class="muted" style="padding:0 0 8px;color:#43565F;font-weight:400">אתר / שירות</th><th scope="col" align="right" width="24%" class="muted" style="padding:0 4px 8px;color:#43565F;font-weight:400">מצב</th><th scope="col" align="left" width="32%" class="muted" style="padding:0 0 8px;color:#43565F;font-weight:400">נבדק ב־</th></tr></thead><tbody>${orderedOps.map(app => `<tr><th class="rule" scope="row" align="right" style="padding:8px 0;${rule};font-weight:400;overflow-wrap:anywhere"><a class="link" dir="auto" href="${esc(reportLink(app, period, true))}" style="${linkStyle}">${esc(app.name)}</a></th><td class="rule ${app.status === 'online' ? 'muted' : 'attention'}" style="padding:8px 4px;${rule};color:${app.status === 'online' ? '#43565F' : '#B42332'}">${status(app.status)}</td><td dir="ltr" align="left" class="rule muted" style="padding:8px 0;${rule};${muted};overflow-wrap:anywhere">${esc(checked(app.last_checked))}</td></tr>`).join('')}</tbody></table>` : '';
    const overviewLink = esc(reportLink({}, period));
    // Inline styles and bgcolor remain usable when an email client strips CSS.
    const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>
:root{color-scheme:light dark}a:focus-visible{outline:2px solid #006775;outline-offset:3px}
@media(max-width:600px){.outer{padding:12px 8px!important}.content{padding:20px 12px!important}}
@media(prefers-color-scheme:dark){body,.canvas{background:#111A1F!important;color:#F0F5F7!important}.sheet{background:#202D34!important;color:#F0F5F7!important}.summary{background:#2C3B43!important;color:#F0F5F7!important}.muted{color:#ADBDC5!important}.link{color:#81D4DF!important}.rule{border-color:#3D515B!important}.attention{color:#F0A8B1!important}}
</style></head><body class="canvas" style="margin:0;padding:0;background:#F5F7F8;color:#172126;font-family:'Noto Sans Hebrew',Arial,sans-serif;font-variant-numeric:tabular-nums">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(summary)}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" class="canvas" bgcolor="#F5F7F8" style="width:100%;background:#F5F7F8"><tr><td class="outer" align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="640"><tr><td><![endif]-->
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" class="sheet" bgcolor="#FFFFFF" style="max-width:640px;width:100%;table-layout:fixed;background:#FFFFFF;color:#172126"><tr><td class="content" style="padding:28px;text-align:right;overflow-wrap:anywhere">
<h1 style="font-size:21px;line-height:1.4;margin:0 0 6px">${title}</h1><p style="margin:0;font-size:14px;line-height:1.6"><span dir="ltr">${esc(label)}</span></p><p class="muted" style="margin:4px 0 20px;font-size:12px;line-height:1.6;color:#43565F">מול <span dir="ltr">${esc(comparison)}</span> · שעון ישראל</p>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" class="summary" bgcolor="#E7EEF0" style="width:100%;table-layout:fixed;background:#E7EEF0"><tr>${[
        ['ביקורים שנמדדו', n(totalVisits), `<span dir="auto">${esc(change(totalVisits, previousVisits))}</span> · קודם ${n(previousVisits)}`],
        ['לחיצות קשר', n(totalContacts), ''], ['אתרים', n(rows.length), '']
    ].map(([name, value, sub]) => `<td align="center" valign="top" width="33%" style="padding:14px 3px"><span class="muted" style="font-size:12px;color:#43565F">${name}</span><strong dir="ltr" style="display:block;font-size:26px;line-height:1.4;margin-top:4px">${value}</strong>${sub ? `<span class="muted" style="display:block;${muted}">${sub}</span>` : ''}</td>`).join('')}</tr></table>
${attention.length ? `<p class="attention" style="margin:16px 0 0;color:#B42332;font-size:13px;line-height:1.6">${n(attention.length)} דורשים בדיקה: ${attention.map(app => `<a class="link" href="${esc(reportLink(app, period, true))}" dir="auto" style="${linkStyle}">${esc(app.name)}</a>`).join(' · ')}</p>` : ''}
<h2 style="font-size:16px;margin:24px 0 12px">לפי אתר</h2>
<table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse"><thead><tr><th scope="col" align="right" width="34%" class="muted" style="padding:0 0 10px;font-size:11px;line-height:1.4;color:#43565F;font-weight:400">אתר</th>${['מבקרים<br>משוערים', 'ביקורים<br>שנמדדו', 'עמודים<br>שנפתחו'].map(name => `<th scope="col" width="22%" align="center" class="muted" style="padding:0 2px 10px;font-size:11px;line-height:1.4;color:#43565F;font-weight:400">${name}</th>`).join('')}</tr></thead><tbody>${siteRows || '<tr><td colspan="4" style="padding:14px 0">אין אתרים להצגה.</td></tr>'}</tbody></table>
<p style="margin:16px 0 0;font-size:14px"><a class="link" href="${overviewLink}" style="${linkStyle}">הדוח המלא ב־Server Monitor</a></p>
${operationsHtml}
<p class="rule muted" style="${rule};margin:24px 0 0;padding-top:14px;${muted}">${esc(caveat)}<br>${esc(measurementHelp)} נתוני שרת נפרדים בדוח המלא.</p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
    const text = [title, label, `מול ${comparison} · שעון ישראל`, summary,
        `שינוי בביקורים: ${change(totalVisits, previousVisits)} · קודם ${n(previousVisits)}`, '', 'לפי אתר',
        ...orderedRows.flatMap(row => [row.name,
            !row.browserSignalPageViews && row.pageViews > 0
                ? 'מבקרים משוערים: — · ביקורים שנמדדו: — · עמודים שנפתחו: —'
                : `מבקרים משוערים: ${n(row.browserSignalVisitors)} · ביקורים שנמדדו: ${n(row.browserSignalSessions)} · עמודים שנפתחו: ${n(row.browserSignalPageViews)}`,
            ...(!row.browserSignalPageViews && row.pageViews > 0 ? [] : [`שינוי בביקורים: ${change(row.browserSignalSessions, row.previousBrowserSignalSessions)}`]),
            ...(row.contactClicks > 0 ? [`${n(row.contactClicks)} לחיצות קשר`] : []),
            ...(measurementNote(row) ? [measurementNote(row)] : []), ...jewelryNotes(row),
            ...(jewelryNotes(row).length && siteUrl(row.url) ? [siteUrl(row.url)] : []), reportLink(row, period), ''
        ]), ...(operations.length ? ['מצב האתרים והשירותים — הבדיקה האחרונה בלבד · שעון ישראל',
            ...orderedOps.map(app => `${app.name}: ${status(app.status)} · ${checked(app.last_checked)}\n${reportLink(app, period, true)}`)] : []),
        '', caveat, measurementHelp, 'נתוני שרת נפרדים בדוח המלא.', reportLink({}, period)].join('\n');
    return { subject: `Server Monitor — ${title} | ${label}`, html, text };
}
module.exports = { renderEmail, reportLink };
