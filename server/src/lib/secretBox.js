// AES-256-GCM encryption for secrets at rest (GitHub PATs). The key is
// derived from JWT_SECRET — rotating JWT_SECRET invalidates stored tokens,
// which is documented in CLAUDE.md. Values are stored as
// "v1.<iv>.<authTag>.<ciphertext>" (base64 parts); anything without the
// prefix is treated as legacy plaintext and still readable.
const crypto = require('crypto');

function deriveKey() {
  return crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET}::pat-encryption`)
    .digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(stored) {
  if (!stored) return null;
  if (!stored.startsWith('v1.')) return stored; // legacy plaintext
  try {
    const [, ivB64, tagB64, dataB64] = stored.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // wrong key or corrupted — treat as absent
  }
}

module.exports = { encryptSecret, decryptSecret };
