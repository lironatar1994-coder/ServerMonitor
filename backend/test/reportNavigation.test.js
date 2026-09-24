const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('email destinations stay internal and preserve valid report periods', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/reportNavigation.js'), 'utf8');
    const { safeReturnPath, reportRange } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const route = '/visitors/20?from=2026-09-22T21:00:00.000Z&to=2026-09-23T21:00:00.000Z';
    assert.equal(safeReturnPath(route), route);
    for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/visitors/../login', null]) {
        assert.equal(safeReturnPath(value), '/visitors');
    }
    assert.deepEqual(reportRange(route.split('?')[1]), { from: '2026-09-22T21:00:00.000Z', to: '2026-09-23T21:00:00.000Z' });
    for (const search of ['', 'from=bad&to=bad', 'from=2026-09-24&to=2026-09-23', 'from=2026-01-01&to=2026-09-23']) {
        assert.equal(reportRange(search), null);
    }
});
