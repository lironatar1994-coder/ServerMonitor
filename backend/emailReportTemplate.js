const BASE = 'https://monitor.vee-app.co.il/serve-monitor';
const n = value => new Intl.NumberFormat('he-IL').format(Number(value) || 0);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const date = value => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
const status = value => value === 'online' ? 'תקין' : value === 'unknown' || !value ? 'טרם נבדק' : 'דורש בדיקה';
const linkStyle = 'color:#245c49;text-decoration:underline';
const noteHtml = value => esc(value).replace(/\/[a-zA-Z0-9_/%.-]+/g, path => `<span dir="ltr" style="unicode-bidi:isolate">${path}</span>`);

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
    if (!b) return a ? 'לא נרשמה פעילות בתקופה הקודמת' : 'ללא שינוי';
    if (a === b) return 'ללא שינוי';
    const delta = Math.abs(a - b);
    // Small counts do not justify dramatic percentage headlines.
    return `${n(delta)} ${a > b ? 'יותר' : 'פחות'}${b >= 30 ? ` (${Math.round(delta / b * 100)}%)` : ''}`;
}

function pageName(row) {
    if (row.topPage === '/') return 'עמוד הבית';
    const names = { miryam: 'מרים זליג', libi: 'ליבי יהלומים', pinhas: 'פנחס רצון', koral: 'קורל אירועים', reuven: 'דפוס ראובן', sos: 'בדרך אליך', seder: 'סדר', pdf: 'PDF Studio' };
    const slug = row.name === 'LA webs' && row.topPage?.match(/^\/work\/([^/]+)\/?$/)?.[1];
    return slug && names[slug] ? `פרויקט ${names[slug]}` : row.topPage;
}

function siteNotes(row) {
    const notes = [];
    if (!row.browserSignalPageViews && row.pageViews > 0) notes.push('השרת רשם פתיחת עמודים, אך לא נמדדו ביקורים באתר. כדאי לבדוק את המדידה.');
    else if (!row.browserSignalPageViews && !row.pageViews) notes.push('לא נרשמה תנועה בתקופה הזו. זה לבדו אינו מעיד על תקלה.');
    else if (row.browserSignalSessions < 30) notes.push('מעט ביקורים נמדדו; עדיין מוקדם להסיק מגמה.');
    if (row.topPage && row.topPage !== '—') notes.push(`העמוד הנצפה ביותר לפי נתוני השרת: ${pageName(row)}`);
    const product = row.jewelryInterest?.summary?.top_product;
    if (product) notes.push(`התכשיט הנצפה ביותר: ${product.name} · ${n(product.page_views)} צפיות`);
    const collection = row.jewelryInterest?.summary?.top_collection;
    if (collection) notes.push(`קטגוריה מובילה: ${collection.label}`);
    return notes;
}

function highlights(rows, operations) {
    const items = [];
    const attention = operations.filter(app => app.status !== 'online');
    if (attention.length) items.push(`מצב נוכחי: ${attention.map(app => `${app.name} — ${status(app.status)}`).join(' · ')}`);
    const changed = rows.filter(row => row.previousBrowserSignalSessions >= 30 &&
        Math.abs(row.browserSignalSessions - row.previousBrowserSignalSessions) >= 10 &&
        Math.abs(row.browserSignalSessions - row.previousBrowserSignalSessions) / row.previousBrowserSignalSessions >= .25)
        .sort((a, b) => Math.abs(b.browserSignalSessions - b.previousBrowserSignalSessions) - Math.abs(a.browserSignalSessions - a.previousBrowserSignalSessions)).slice(0, 2);
    for (const row of changed) items.push(`${row.name}: ${n(row.browserSignalSessions)} ביקורים שנמדדו, ${change(row.browserSignalSessions, row.previousBrowserSignalSessions)} לעומת התקופה הקודמת.`);
    const contacts = rows.filter(row => row.contactClicks > 0).sort((a, b) => b.contactClicks - a.contactClicks).slice(0, 3);
    if (contacts.length) items.push(`לחיצות ליצירת קשר: ${contacts.map(row => `${row.name} — ${n(row.contactClicks)}`).join(' · ')}. לחיצה אינה אישור שנשלחה פנייה.`);
    return items;
}

function renderEmail(type, period, rows, operations = []) {
    const title = type === 'daily' ? 'דוח אתרים יומי' : 'דוח אתרים שבועי';
    const label = periodLabel(period.from, period.to);
    const comparison = periodLabel(period.previousFrom, period.from);
    const insights = highlights(rows, operations);
    const orderedRows = [...rows].sort((a, b) => b.browserSignalSessions - a.browserSignalSessions || b.pageViews - a.pageViews || a.name.localeCompare(b.name));
    const totalVisits = rows.reduce((sum, row) => sum + (Number(row.browserSignalSessions) || 0), 0);
    const previousVisits = rows.reduce((sum, row) => sum + (Number(row.previousBrowserSignalSessions) || 0), 0);
    const totalContacts = rows.reduce((sum, row) => sum + (Number(row.contactClicks) || 0), 0);
    const caveat = 'המבקרים הם הערכה, לא זיהוי של אנשים. אותו אדם עשוי להיספר בכמה מכשירים או אתרים, וחלק מהביקורים אינם נמדדים. אוטומציה מוכרת מסוננת. לחיצות ליצירת קשר אינן פניות שהתקבלו.';
    const siteCards = orderedRows.map(row => {
        const href = esc(reportLink(row, period));
        const metrics = [
            ['מבקרים משוערים', row.browserSignalVisitors, row.previousBrowserSignalVisitors],
            ['ביקורים שנמדדו', row.browserSignalSessions, row.previousBrowserSignalSessions],
            ['עמודים שנפתחו', row.browserSignalPageViews, row.previousBrowserSignalPageViews]
        ];
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;background:#fff;border:1px solid #d8d0c2;margin:0 0 16px">
<tr><td style="padding:18px 18px 12px"><a href="${href}" dir="auto" style="${linkStyle};display:inline-block;font-weight:bold;font-size:20px">${esc(row.name)}</a>${siteUrl(row.url) ? `<br><a href="${esc(siteUrl(row.url))}" dir="ltr" style="display:inline-block;max-width:100%;overflow-wrap:anywhere;color:#59564e;font-size:12px;margin-top:6px">${esc(row.url)}</a>` : ''}</td></tr>
<tr><td style="padding:0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${metrics.map(([name, value, previous]) => `<td width="33%" valign="top" style="padding:8px 2px 16px;text-align:right"><span style="font-size:13px;color:#59564e">${name}</span><br><strong style="font-size:25px;line-height:1.5">${n(value)}</strong><br><span style="font-size:12px;color:#59564e">${esc(change(value, previous))}</span></td>`).join('')}</tr></table></td></tr>
<tr><td style="padding:12px 18px;border-top:1px solid #e4ded3;font-size:14px;line-height:1.7"><strong>לחיצות ליצירת קשר: ${n(row.contactClicks)}</strong>${siteNotes(row).map(note => `<div style="overflow-wrap:anywhere;word-break:break-word">${noteHtml(note)}</div>`).join('')}</td></tr>
<tr><td style="padding:10px 18px;background:#faf7f1;font-size:12px;line-height:1.7;color:#59564e">נתוני שרת נפרדים: ${n(row.pageViews)} פתיחות עמודים · ${n(row.uniqueCandidates)} כתובות רשת שונות. אלה אינם מבקרים נוספים.</td></tr>
</table>`;
    }).join('');
    const orderedOps = [...operations].sort((a, b) => Number(a.status === 'online') - Number(b.status === 'online') || a.name.localeCompare(b.name));
    const checked = value => {
        if (!value) return 'טרם נבדק';
        const parsed = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
        return Number.isNaN(parsed.getTime()) ? 'מועד לא ידוע' : new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(parsed);
    };
    const operationsHtml = operations.length ? `<h2 style="font-size:20px;margin:26px 0 6px">מצב האתרים והשירותים</h2><p style="font-size:13px;color:#59564e;margin:0 0 12px">הבדיקה האחרונה בלבד, ולא סיכום תקלות לאורך תקופת הדוח.</p><table width="100%" cellpadding="10" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;background:#fff;font-size:13px"><tr><th scope="col" align="right" width="45%">אתר או שירות</th><th scope="col" align="right" width="25%">מצב</th><th scope="col" align="right">נבדק ב־</th></tr>${orderedOps.map(app => `<tr><td style="border-top:1px solid #e4ded3;overflow-wrap:anywhere"><a href="${esc(reportLink(app, period, true))}" style="${linkStyle}">${esc(app.name)}</a></td><td style="border-top:1px solid #e4ded3;color:${app.status === 'online' ? '#245c49' : '#a33325'}">${status(app.status)}</td><td style="border-top:1px solid #e4ded3">${esc(checked(app.last_checked))}</td></tr>`).join('')}</table>` : '';
    const summary = `${rows.length} אתרים · ${n(totalVisits)} ביקורים שנמדדו · ${n(totalContacts)} לחיצות ליצירת קשר`;
    const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.email-wrap{padding:12px!important}.intro{padding:20px!important}}</style></head><body style="margin:0;background:#eee8dc;color:#171713;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(summary)}</div><div class="email-wrap" style="max-width:680px;margin:0 auto;padding:24px;text-align:right">
<div class="intro" style="background:#171713;color:#f5efe3;padding:26px;margin-bottom:18px"><h1 style="font-size:28px;margin:0 0 10px">${title}</h1><div>${esc(label)}</div><div style="font-size:13px;color:#d5cec2;margin-top:6px">בהשוואה ל־${esc(comparison)} · שעון ישראל</div></div>
<p style="font-size:16px;line-height:1.8;margin:0 0 4px"><strong>${esc(summary)}</strong></p><p style="font-size:13px;color:#59564e;margin:0 0 18px">ביקורים לעומת התקופה הקודמת: ${esc(change(totalVisits, previousVisits))}. הסכום הוא לפי אתר.</p>
${insights.length ? `<div style="padding:16px 18px;background:#ded6c8;margin-bottom:20px"><h2 style="font-size:17px;margin:0 0 8px">עיקרי הדוח</h2>${insights.map(text => `<p style="margin:6px 0;font-size:14px;line-height:1.7">${esc(text)}</p>`).join('')}</div>` : ''}
${siteCards || '<p>אין אתרים להצגה.</p>'}${operationsHtml}
<p style="font-size:12px;color:#59564e;line-height:1.8;margin:22px 0 12px">${caveat} נתוני השרת כוללים פתיחת עמודים בלבד, ללא תמונות וקובצי אתר. בשתי שיטות המדידה ייתכן שתיכלל אוטומציה שלא זוהתה.</p>
<p style="font-size:14px"><a href="${esc(reportLink({}, period))}" style="${linkStyle}">כל האתרים ב־Server Monitor</a></p></div></body></html>`;
    const text = [title, label, `בהשוואה ל־${comparison} · שעון ישראל`, summary, `ביקורים לעומת התקופה הקודמת: ${change(totalVisits, previousVisits)}. הסכום הוא לפי אתר.`, '', ...insights, '', ...orderedRows.flatMap(row => [
        row.name, `מבקרים משוערים: ${n(row.browserSignalVisitors)} · ביקורים שנמדדו: ${n(row.browserSignalSessions)} · עמודים שנפתחו: ${n(row.browserSignalPageViews)}`,
        `ביקורים לעומת התקופה הקודמת: ${change(row.browserSignalSessions, row.previousBrowserSignalSessions)}`,
        `לחיצות ליצירת קשר: ${n(row.contactClicks)}`, ...siteNotes(row),
        `נתוני שרת נפרדים: ${n(row.pageViews)} פתיחות עמודים · ${n(row.uniqueCandidates)} כתובות רשת שונות. אלה אינם מבקרים נוספים.`, reportLink(row, period), ''
    ]), ...(operations.length ? ['מצב האתרים והשירותים — הבדיקה האחרונה בלבד', ...orderedOps.map(app => `${app.name}: ${status(app.status)} · ${checked(app.last_checked)}\n${reportLink(app, period, true)}`)] : []), '', caveat, reportLink({}, period)].join('\n');
    return { subject: `Server Monitor — ${title} | ${label}`, html, text };
}

module.exports = { renderEmail, reportLink };
