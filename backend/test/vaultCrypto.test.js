const test = require("node:test"),
  assert = require("node:assert/strict");
test("vault envelopes authenticate identity/version/epoch; sharing, recovery and key rotation work", async () => {
  const c = await import("../../frontend/src/vault/crypto.js");
  const pass = "synthetic master passphrase 2026",
    identity = await c.makeIdentity(42, pass),
    privateKey = await c.openIdentity(42, pass, identity.record),
    raw = c.randomBytes(32),
    key = await c.aes(raw);
  const wrapped = await c.wrapKey(raw, identity.record.publicKey);
  assert.deepEqual(await c.unwrapKey(wrapped, privateKey), raw);
  const id = crypto.randomUUID(),
    context = c.entryContext(id, "secret", 1, 1),
    secret = { password: "synthetic-only-password", notes: "שלום" };
  const encrypted = await c.encrypt(key, secret, context);
  assert.deepEqual(await c.decrypt(key, encrypted, context), secret);
  assert.equal(JSON.stringify(encrypted).includes(secret.password), false);
  await assert.rejects(
    c.decrypt(key, encrypted, c.entryContext(id, "secret", 2, 1)),
  );
  await assert.rejects(
    c.decrypt(key, encrypted, c.entryContext(id, "metadata", 1, 1)),
  );
  await assert.rejects(c.openIdentity(42, "wrong passphrase", identity.record));
  await assert.rejects(c.openIdentity(43, pass, identity.record));
  const bytes = c.decode(encrypted.data);
  bytes[0] ^= 1;
  await assert.rejects(
    c.decrypt(key, { ...encrypted, data: c.encode(bytes) }, context),
  );
  const recovered = await c.recoverIdentity(
    42,
    identity.recoveryCode,
    "new synthetic master phrase",
    identity.record,
  );
  assert.deepEqual(
    await c.unwrapKey(
      wrapped,
      await c.openIdentity(42, "new synthetic master phrase", recovered),
    ),
    raw,
  );
  const member = await c.makeIdentity(99, "member synthetic master phrase");
  assert.deepEqual(
    await c.unwrapKey(
      await c.wrapKey(raw, member.record.publicKey),
      await c.openIdentity(99, "member synthetic master phrase", member.record),
    ),
    raw,
  );
  const newKey = await c.aes(c.randomBytes(32)),
    rotated = await c.encrypt(
      newKey,
      secret,
      c.entryContext(id, "secret", 1, 2),
    );
  await assert.rejects(
    c.decrypt(key, rotated, c.entryContext(id, "secret", 1, 2)),
  );
  const ivs = new Set();
  for (let i = 0; i < 100; i++)
    ivs.add((await c.encrypt(key, {}, "nonce-test")).iv);
  assert.equal(ivs.size, 100);
});
test("password generation is bounded and login URLs reject executable and embedded credentials", async () => {
  const c = await import("../../frontend/src/vault/crypto.js");
  assert.equal(c.generatePassword().length, 24);
  assert.equal(c.generatePassword(64, false).length, 64);
  assert.throws(() => c.generatePassword(1));
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,a",
    "https://user:password@example.com",
    "/relative",
  ])
    assert.equal(c.safeLoginUrl(bad), null);
  assert.equal(
    c.safeLoginUrl("https://example.com/login").url,
    "https://example.com/login",
  );
  assert.equal(c.safeLoginUrl("http://localhost:3000").insecure, true);
});
