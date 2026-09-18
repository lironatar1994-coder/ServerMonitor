const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSystemdSnapshot, UNIT_PATTERN } = require('../systemd');
const { buildApplicationUsage, parseProcessTable } = require('../resourceUsage');

test('systemd health requires a loaded active unit with a running PID', () => {
    const rows = parseSystemdSnapshot('Id=maavar.service\nLoadState=loaded\nActiveState=active\nMainPID=100\nMemoryCurrent=4096\n\nId=maavar-worker.service\nLoadState=loaded\nActiveState=failed\nMainPID=0\n\nId=absent.service\nLoadState=not-found\nActiveState=inactive\nMainPID=0');
    assert.deepEqual(rows.map((row) => row.status), ['online', 'offline', 'offline']);
    assert.equal(rows[0].memory, 4096);
    assert.equal(UNIT_PATTERN.test('--all'), false);
    assert.equal(UNIT_PATTERN.test('maavar.service;reboot'), false);
    assert.equal(UNIT_PATTERN.test('maavar-worker.service'), true);
});

test('systemd resources include descendants and preserve manager identity', () => {
    const processes = parseProcessTable('100 1 1.0 1000 node server.js\n101 100 2.0 2000 node worker.js');
    const rows = buildApplicationUsage([{ name: 'maavar.service', systemd_unit: 'maavar.service', pid: 100, status: 'online' }],
        [{ id: 42, name: 'Maavar', systemd_unit: 'maavar.service' }], processes, 1024 * 1024);
    assert.equal(rows[0].app_id, 42);
    assert.equal(rows[0].runtime_manager, 'systemd');
    assert.equal(rows[0].pm2_name, null);
    assert.equal(rows[0].memory_bytes, 3000 * 1024);
    assert.equal(rows[0].cpu_percent, 3);
    assert.equal(rows[0].process_count, 2);
});
