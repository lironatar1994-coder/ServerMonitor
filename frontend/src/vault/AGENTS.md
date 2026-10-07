# Team vault

## Purpose
- Own browser-only vault cryptography, worker isolation, and bounded credential handling.

## Ownership
- `crypto.js` implements versioned Web Crypto envelopes and key wrapping.
- `crypto.worker.js` holds unwrapped keys for one unlocked tab.
- `client.js` owns worker lifecycle; `../pages/Vault.jsx` owns idle/hidden locking and decrypted view state.
- `LockedVault`, `EntryForm`, `TeamPanel` and `vault.css` own unlock/recovery, credential editing, invitation/permission UI and responsive list/detail geometry.

## Local Contracts
- Master passphrases and plaintext keys never leave the browser. Never log worker messages or persist plaintext.
- AES-GCM binds each entry ID, part, version, and epoch as additional authenticated data.
- User keys use RSA-OAEP-3072/SHA-256; private-key envelopes use PBKDF2-SHA-256 at 600,000 iterations.
- Terminate the worker on lock. Recovery keys are displayed only for user-controlled offline saving.

## Work Guidance
- Keep all cryptography in Web Crypto; do not implement cryptographic algorithms.

## Verification
- `backend/test/vaultCrypto.test.js` verifies round trips, tampering, key sharing, and rotation.

## Child DOX Index
- No child contracts.
