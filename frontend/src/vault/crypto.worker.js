import * as c from "./crypto";
let privateKey, rawKey, key;
const open = () => {
  if (!key) throw new Error("הכספת נעולה.");
};
const handlers = {
  setup: ({ userId, passphrase }) => c.makeIdentity(userId, passphrase),
  recover: ({ userId, recoveryCode, passphrase, record }) =>
    c.recoverIdentity(userId, recoveryCode, passphrase, record),
  async unlock({ userId, passphrase, record, wrappedKey }) {
    privateKey = await c.openIdentity(userId, passphrase, record);
    if (wrappedKey) {
      rawKey = await c.unwrapKey(wrappedKey, privateKey);
      key = await c.aes(rawKey);
    }
    return true;
  },
  async initialize({ publicKey }) {
    rawKey = c.randomBytes(32);
    key = await c.aes(rawKey);
    return c.wrapKey(rawKey, publicKey);
  },
  async grant({ publicKey }) {
    open();
    return c.wrapKey(rawKey, publicKey);
  },
  async metadata({ entries }) {
    open();
    return Promise.all(
      entries.map(async (e) => ({
        ...e,
        fields: await c.decrypt(
          key,
          e.metadata,
          c.entryContext(e.id, "metadata", e.version, e.epoch),
        ),
      })),
    );
  },
  async secret({ entry }) {
    open();
    return c.decrypt(
      key,
      entry.secret,
      c.entryContext(entry.id, "secret", entry.version, entry.epoch),
    );
  },
  async save({ id, version, epoch, metadata, secret }) {
    open();
    return {
      metadata: await c.encrypt(
        key,
        metadata,
        c.entryContext(id, "metadata", version, epoch),
      ),
      secret: await c.encrypt(
        key,
        secret,
        c.entryContext(id, "secret", version, epoch),
      ),
    };
  },
  generate: ({ length, symbols }) => c.generatePassword(length, symbols),
  async rotation({ entries, members, epoch }) {
    open();
    const nextRaw = c.randomBytes(32),
      nextKey = await c.aes(nextRaw),
      nextEntries = [];
    for (const e of entries) {
      const metadata = await c.decrypt(
          key,
          e.metadata,
          c.entryContext(e.id, "metadata", e.version, e.epoch),
        ),
        secret = await c.decrypt(
          key,
          e.secret,
          c.entryContext(e.id, "secret", e.version, e.epoch),
        );
      nextEntries.push({
        id: e.id,
        version: e.version,
        metadata: await c.encrypt(
          nextKey,
          metadata,
          c.entryContext(e.id, "metadata", e.version, epoch + 1),
        ),
        secret: await c.encrypt(
          nextKey,
          secret,
          c.entryContext(e.id, "secret", e.version, epoch + 1),
        ),
      });
    }
    return {
      entries: nextEntries,
      members: await Promise.all(
        members.map(async (m) => ({
          userId: m.user_id,
          wrappedKey: await c.wrapKey(nextRaw, m.public_key),
        })),
      ),
    };
  },
};
self.onmessage = async ({ data }) => {
  try {
    if (!handlers[data.type]) throw new Error("Unknown command");
    self.postMessage({
      id: data.id,
      value: await handlers[data.type](data.payload),
    });
  } catch {
    self.postMessage({
      id: data.id,
      error: "לא ניתן לפענח את הנתונים. בדקו את הסיסמה או את מפתח השחזור.",
    });
  }
};
