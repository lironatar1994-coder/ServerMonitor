const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApplicationUsage, collectProcessTree, parseProcessTable } = require('../resourceUsage');

const processTable = `
100 1 0.2 20000 npm start
101 100 1.4 480000 next-server (v15.5.20)
102 101 0.1 8000 next-worker
200 1 0.3 70000 node /root/Vee/backend/server.js
300 1 0.4 90000 node /root/unmapped/server.js
`;

test('parses Linux process rows and preserves commands with spaces', () => {
    const rows = parseProcessTable(processTable);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[1], {
        pid: 101,
        ppid: 100,
        cpu: 1.4,
        rss_bytes: 480000 * 1024,
        command: 'next-server (v15.5.20)'
    });
});

test('collects descendants and attributes complete process-tree resources to PM2 apps', () => {
    const processes = parseProcessTable(processTable);
    processes.find((process) => process.pid === 101).swap_bytes = 160000 * 1024;
    assert.deepEqual(collectProcessTree(100, processes).map((process) => process.pid).sort(), [100, 101, 102]);
    const usage = buildApplicationUsage([
        { name: 'libi-diamonds-live', pid: 100, monit: { memory: 20 * 1024 * 1024 }, pm2_env: { status: 'online' } },
        { name: 'vee-app', pid: 200, monit: { memory: 70 * 1024 * 1024 }, pm2_env: { status: 'online' } },
        { name: 'unmapped-worker', pid: 300, monit: { memory: 90 * 1024 * 1024 }, pm2_env: { status: 'online' } }
    ], [
        { id: 9, name: 'Libi Diamonds', pm2_name: 'libi-diamonds-live' },
        { id: 3, name: 'Vee Main App', pm2_name: 'vee-app' }
    ], processes, 2 * 1024 * 1024 * 1024);

    assert.equal(usage[0].name, 'Libi Diamonds');
    assert.equal(usage[0].process_count, 3);
    assert.equal(usage[0].memory_bytes, (20000 + 480000 + 8000) * 1024);
    assert.equal(usage[0].child_memory_bytes, (480000 + 8000) * 1024);
    assert.equal(usage[0].swap_bytes, 160000 * 1024);
    assert.equal(usage[0].footprint_bytes, (20000 + 480000 + 8000 + 160000) * 1024);
    assert.equal(usage[0].dominant_process, 'next-server (v15.5.20)');
    assert.equal(usage[1].name, 'unmapped-worker');
    assert.equal(usage[1].app_id, null);
    assert.equal(usage[2].name, 'Vee Main App');
});
