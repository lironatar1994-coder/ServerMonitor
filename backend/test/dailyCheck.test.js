const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/dailyCheck.js'), 'utf8')).toString('base64')}`);
test('daily comparisons do not exaggerate low counts or infer missing measurements', async () => {
  const { changeLabel, previousRange, rangeSearch } = await load();
  assert.equal(changeLabel(3, 1), '2 יותר');
  assert.equal(changeLabel(1, 3), '2 פחות');
  assert.equal(changeLabel(100, 0), 'ללא פעילות קודמת');
  assert.equal(changeLabel(0, 0), 'ללא פעילות קודמת');
  assert.equal(changeLabel(60, 30), '30 יותר (100%)');
  assert.equal(changeLabel(0, undefined), 'השוואה לא זמינה');
  const range = { from: '2026-09-20T21:00:00.000Z', to: '2026-09-23T21:00:00.000Z' };
  assert.deepEqual(previousRange(range), { from: '2026-09-17T21:00:00.000Z', to: range.from });
  assert.equal(new URLSearchParams(rangeSearch(range)).get('to'), range.to);
});
test('sparse chart comparisons align time buckets and leave failed comparisons absent', async () => {
  const { comparisonSeries } = await load();
  const range = { from: '2026-09-23T00:00:00.000Z', to: '2026-09-24T00:00:00.000Z' };
  const rows = comparisonSeries([{ bucket: '2026-09-23T05:00:00Z', views: 3 }], [{ bucket: '2026-09-22T08:00:00Z', views: 7 }], range, 'views');
  assert.equal(rows.length, 24); assert.equal(rows[5].current, 3); assert.equal(rows[5].previous, 0); assert.equal(rows[8].previous, 7);
  assert.ok(comparisonSeries([], null, range, 'views').every(row => row.previous === null));
});
