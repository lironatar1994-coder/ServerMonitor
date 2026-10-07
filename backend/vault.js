const { randomUUID } = require("node:crypto");
const s = require("./security");
function initVault(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS vault_state (id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,rotation_required INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vault_keys (user_id INTEGER PRIMARY KEY REFERENCES users(id),public_key TEXT NOT NULL,private_key TEXT NOT NULL,recovery_key TEXT,kdf TEXT NOT NULL,fingerprint TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vault_members (user_id INTEGER PRIMARY KEY REFERENCES users(id),wrapped_key TEXT NOT NULL,epoch INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vault_entries (id TEXT PRIMARY KEY,epoch INTEGER NOT NULL,version INTEGER NOT NULL,metadata TEXT NOT NULL,secret TEXT NOT NULL,updated_at INTEGER NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),trashed_at INTEGER);
    CREATE TABLE IF NOT EXISTS vault_favorites (user_id INTEGER NOT NULL REFERENCES users(id),entry_id TEXT NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,PRIMARY KEY(user_id,entry_id));
    CREATE TABLE IF NOT EXISTS vault_invites (token_hash TEXT PRIMARY KEY,created_by INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS vault_audit (id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,action TEXT NOT NULL,entry_id TEXT,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS vault_audit_time ON vault_audit(created_at);`);
}
const idValid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
function envelope(value, max = 48000) {
  return (
    value &&
    value.v === 1 &&
    typeof value.iv === "string" &&
    /^[A-Za-z0-9+/]{16}$/.test(value.iv) &&
    typeof value.data === "string" &&
    value.data.length >= 24 &&
    value.data.length <= max &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
  );
}
function keyRecord(value) {
  if (!(
    value &&
    typeof value.publicKey === "string" &&
    value.publicKey.length < 2048 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.publicKey) &&
    envelope(value.privateKey, 12000) &&
    (!value.recoveryKey || envelope(value.recoveryKey, 12000)) &&
    value.kdf?.iterations === 600000 &&
    typeof value.kdf.salt === "string" &&
    /^[A-Za-z0-9+/]{22}==$/.test(value.kdf.salt)
  ))
    return false;
  try {
    const key = require("node:crypto").createPublicKey({
      key: Buffer.from(value.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    return (
      key.asymmetricKeyType === "rsa" &&
      key.asymmetricKeyDetails.modulusLength === 3072 &&
      key.asymmetricKeyDetails.publicExponent === 65537n
    );
  } catch {
    return false;
  }
}
function audit(db, actor, action, id = null) {
  db.prepare(
    "INSERT INTO vault_audit(actor_id,action,entry_id,created_at) VALUES (?,?,?,?)",
  ).run(actor, action, id, Date.now());
  db.prepare("DELETE FROM vault_audit WHERE created_at<?").run(
    Date.now() - 90 * 86400000,
  );
}
function fingerprint(publicKey) {
  return s.hash(Buffer.from(publicKey, "base64"));
}
function storeKeys(db, userId, data) {
  db.prepare("INSERT INTO vault_keys VALUES (?,?,?,?,?,?)").run(
    userId,
    data.publicKey,
    JSON.stringify(data.privateKey),
    data.recoveryKey ? JSON.stringify(data.recoveryKey) : null,
    JSON.stringify(data.kdf),
    fingerprint(data.publicKey),
  );
}
function keysFor(db, id) {
  const row = db.prepare("SELECT * FROM vault_keys WHERE user_id=?").get(id);
  return (
    row && {
      publicKey: row.public_key,
      privateKey: JSON.parse(row.private_key),
      recoveryKey: row.recovery_key && JSON.parse(row.recovery_key),
      kdf: JSON.parse(row.kdf),
      fingerprint: row.fingerprint,
    }
  );
}
module.exports = {
  initVault,
  idValid,
  envelope,
  keyRecord,
  audit,
  fingerprint,
  storeKeys,
  keysFor,
  randomUUID,
};
