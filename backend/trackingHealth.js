const fs = require('fs');
function trackingHealth() {
    try {
        const result = JSON.parse(fs.readFileSync(process.env.BROWSER_CHECK_RESULT || '/var/lib/lawebs-maintenance/browser-check.json', 'utf8'));
        const stale = !Number.isFinite(result.checked) || Date.now() - result.checked > 7 * 3600000;
        return { status: stale ? 'stale' : result.errors?.length ? 'failed' : 'ok', checked: result.checked,
            failures: Array.isArray(result.errors) ? result.errors.slice(0, 12) : [] };
    } catch { return { status: 'unavailable', checked: null, failures: [] }; }
}
module.exports = { trackingHealth };
