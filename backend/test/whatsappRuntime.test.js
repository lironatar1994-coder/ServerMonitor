const test = require('node:test');
const assert = require('node:assert/strict');
const { whatsappRuntimeStatus } = require('../whatsappRuntime');

test('historical READY/QR files cannot make a stopped WhatsApp process look online', () => {
    for (const status of ['READY', 'NEEDS_SCAN', 'INITIALIZING']) {
        const result = whatsappRuntimeStatus({ status, qrCode: 'old-qr', updatedAt: '2026-08-13T00:00:00Z' }, false);
        assert.equal(result.status, 'STOPPED');
        assert.equal(result.isOnline, false);
        assert.equal(result.pm2Online, false);
        assert.equal(result.qr, null);
    }
});

test('a running process preserves its actual connection state and timestamp', () => {
    const result = whatsappRuntimeStatus({ status: 'needs_scan', qr_code: 'current-qr', updated_at: '2026-10-07T00:00:00Z' }, true);
    assert.equal(result.status, 'NEEDS_SCAN');
    assert.equal(result.qr, 'current-qr');
    assert.equal(result.updatedAt, '2026-10-07T00:00:00Z');
    assert.equal(result.isOnline, true);
});
