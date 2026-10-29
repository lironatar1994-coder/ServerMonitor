const fs = require('fs');
const CHECKER_FAULT = /did not complete|could not finish|runtime budget/;
const SITE_CHECK = /^site-browser-signal-(.+?):/;
const MONITOR_CHECK = /^(monitor-|login-screen|page-drill-down|legacy-monitor-url)/;

// Failure areas from ops/browser-check.cjs; older results without them are classified from their text.
function browserFailures(result) {
    if (Array.isArray(result?.failures)) return result.failures.slice(0, 40).map(item => ({
        check: String(item?.check || ''), area: ['site', 'monitor', 'checker'].includes(item?.area) ? item.area : 'site', site: item?.site ? String(item.site) : null }));
    return (Array.isArray(result?.errors) ? result.errors : []).map(text => {
        const check = String(text).split(':')[0];
        if (CHECKER_FAULT.test(text)) return { check: 'runner', area: 'checker', site: null };
        if (MONITOR_CHECK.test(check)) return { check, area: 'monitor', site: null };
        return { check, area: 'site', site: SITE_CHECK.exec(text)?.[1] || 'LA webs' };
    });
}

function trackingHealth() {
    try {
        const result = JSON.parse(fs.readFileSync(process.env.BROWSER_CHECK_RESULT || '/var/lib/lawebs-maintenance/browser-check.json', 'utf8'));
        const stale = !Number.isFinite(result.checked) || Date.now() - result.checked > 7 * 3600000;
        const items = browserFailures(result);
        // Only checker faults: the sites were not reached, which is different from a failing site.
        const status = stale ? 'stale' : !result.errors?.length ? 'ok' : items.every(item => item.area === 'checker') ? 'incomplete' : 'failed';
        return { status, checked: result.checked, failures: Array.isArray(result.errors) ? result.errors.slice(0, 12) : [], items: items.slice(0, 12) };
    } catch { return { status: 'unavailable', checked: null, failures: [], items: [] }; }
}
module.exports = { trackingHealth, browserFailures };
