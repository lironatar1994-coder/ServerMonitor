const test = require('node:test');
const assert = require('node:assert/strict');
test('dashboard requests time out, reject HTML and preserve valid JSON', async () => {
  const { apiFetch } = await import('../../frontend/src/lib/api.js');
  const original = global.fetch;
  global.localStorage = { getItem: () => 'test' };
  try {
    global.fetch = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    await assert.rejects(apiFetch('/slow', { timeoutMs: 15 }), /לא השיב בזמן/);
    global.fetch = async () => new Response('<html>stale asset</html>', { headers: { 'Content-Type': 'text/html' } });
    await assert.rejects(apiFetch('/bad'), /לא החזיר נתונים/);
    global.fetch = async () => Response.json({ value: 42 });
    assert.deepEqual(await apiFetch('/ok'), { value: 42 });
  } finally { global.fetch = original; delete global.localStorage; }
});
