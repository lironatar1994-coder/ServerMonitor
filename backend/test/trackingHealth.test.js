const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { trackingHealth } = require('../trackingHealth');

test('browser health allows six-hour cadence but exposes failures and stale results', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracking-health-'));
    const previous = process.env.BROWSER_CHECK_RESULT;
    process.env.BROWSER_CHECK_RESULT = path.join(dir, 'check.json');
    try {
        const write = (hours, errors = []) => fs.writeFileSync(process.env.BROWSER_CHECK_RESULT,
            JSON.stringify({ checked: Date.now() - hours * 3600000, errors }));
        write(6.5); assert.equal(trackingHealth().status, 'ok');
        write(7.1); assert.equal(trackingHealth().status, 'stale');
        write(0, ['resource limit']); assert.equal(trackingHealth().status, 'failed');
        fs.unlinkSync(process.env.BROWSER_CHECK_RESULT);
        assert.equal(trackingHealth().status, 'unavailable');
    } finally {
        if (previous === undefined) delete process.env.BROWSER_CHECK_RESULT;
        else process.env.BROWSER_CHECK_RESULT = previous;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
