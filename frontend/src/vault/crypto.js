const utf8 = new TextEncoder();
const text = new TextDecoder();
export const encode = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const decode = (value) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export const randomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));
export const aes = (bytes) =>
  crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
export async function derive(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    "raw",
    utf8.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: decode(salt), iterations: 600000 },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(key, value, context) {
  const iv = randomBytes(12),
    data = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: utf8.encode(context),
        tagLength: 128,
      },
      key,
      utf8.encode(JSON.stringify(value)),
    );
  return { v: 1, iv: encode(iv), data: encode(data) };
}
export async function decrypt(key, envelope, context) {
  if (envelope.v !== 1 || decode(envelope.iv).length !== 12)
    throw new Error("Unsupported envelope");
  return JSON.parse(
    text.decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: decode(envelope.iv),
          additionalData: utf8.encode(context),
          tagLength: 128,
        },
        key,
        decode(envelope.data),
      ),
    ),
  );
}
export const entryContext = (id, part, version, epoch) =>
  `sm-vault:1:${id}:${part}:${version}:${epoch}`;
export const privateContext = (id) => `sm-vault:1:user:${id}:private`;
export async function makeIdentity(userId, passphrase) {
  if (passphrase.length < 15 || passphrase.length > 256)
    throw new Error("סיסמת הכספת צריכה להכיל 15–256 תווים.");
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKey = encode(
      await crypto.subtle.exportKey("spki", pair.publicKey),
    ),
    privateBytes = encode(
      await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    );
  const kdf = {
      name: "PBKDF2-SHA256",
      iterations: 600000,
      salt: encode(randomBytes(16)),
    },
    recoveryBytes = randomBytes(32);
  const privateKey = await encrypt(
    await derive(passphrase, kdf.salt),
    privateBytes,
    privateContext(userId),
  );
  const recoveryKey = await encrypt(
    await aes(recoveryBytes),
    privateBytes,
    privateContext(userId),
  );
  return {
    record: { publicKey, privateKey, recoveryKey, kdf },
    recoveryCode: encode(recoveryBytes),
  };
}
export const importPrivate = (value) =>
  crypto.subtle.importKey(
    "pkcs8",
    decode(value),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
export const importPublic = (value) =>
  crypto.subtle.importKey(
    "spki",
    decode(value),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
export async function openIdentity(userId, passphrase, record) {
  if (record.kdf.iterations !== 600000) throw new Error("Unsupported KDF");
  return importPrivate(
    await decrypt(
      await derive(passphrase, record.kdf.salt),
      record.privateKey,
      privateContext(userId),
    ),
  );
}
export async function recoverIdentity(
  userId,
  recoveryCode,
  passphrase,
  record,
) {
  if (passphrase.length < 15 || passphrase.length > 256)
    throw new Error("סיסמת הכספת צריכה להכיל 15–256 תווים.");
  const bytes = await decrypt(
    await aes(decode(recoveryCode)),
    record.recoveryKey,
    privateContext(userId),
  );
  const kdf = {
    name: "PBKDF2-SHA256",
    iterations: 600000,
    salt: encode(randomBytes(16)),
  };
  return {
    ...record,
    kdf,
    privateKey: await encrypt(
      await derive(passphrase, kdf.salt),
      bytes,
      privateContext(userId),
    ),
  };
}
export const wrapKey = async (bytes, publicKey) =>
  encode(
    await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      await importPublic(publicKey),
      bytes,
    ),
  );
export const unwrapKey = async (value, privateKey) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      decode(value),
    ),
  );
export function generatePassword(length = 24, symbols = true) {
  if (!Number.isInteger(length) || length < 16 || length > 64)
    throw new Error("Invalid password length");
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" +
    (symbols ? "!@#$%&*+-=?" : "");
  let result = "";
  const cutoff = 256 - (256 % chars.length);
  while (result.length < length)
    for (const byte of randomBytes(128)) {
      if (byte < cutoff) result += chars[byte % chars.length];
      if (result.length === length) break;
    }
  return result;
}
export function safeLoginUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? { url: url.href, insecure: url.protocol === "http:" }
      : null;
  } catch {
    return null;
  }
}
