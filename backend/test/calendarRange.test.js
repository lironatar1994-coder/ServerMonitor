const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../frontend/src/lib/calendarRange.js');
const now = Date.parse('2026-10-27T10:00:00Z');

test('calendar dates use Israel time and include the complete selected day', async () => {
    const { inputDate, calendarRange } = await load();
    assert.equal(inputDate('2026-10-26T23:15:00Z'), '2026-10-27');
    assert.deepEqual(calendarRange('2026-10-27', '2026-10-27', now).range,
        { from: '2026-10-26T22:00:00.000Z', to: '2026-10-27T21:59:59.999Z' });
});

test('calendar ranges include the 23-hour and 25-hour Israel DST days', async () => {
    const { calendarRange } = await load();
    for (const [day, hours] of [['2026-03-27', 23], ['2026-10-25', 25]]) {
        const { range } = calendarRange(day, day, now);
        assert.equal(Date.parse(range.to) - Date.parse(range.from) + 1, hours * 3600000);
    }
});

test('missing, invalid, reversed, future and excessive calendar ranges never reach the API', async () => {
    const { calendarRange } = await load();
    for (const [from, to] of [['', ''], ['2026-02-31', '2026-03-02'], ['2026-10-27', '2026-10-26'], ['2026-10-27', '2026-10-28'], ['2026-01-01', '2026-10-27']]) {
        const result = calendarRange(from, to, now);
        assert.ok(result.error);
        assert.equal(result.range, undefined);
    }
    assert.ok(calendarRange('2026-08-01', '2026-10-27', now).range);
});
