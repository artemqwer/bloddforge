// Replacement for Node's `crypto` as used by GramJS (see telegram/CryptoFile.js).
// Hermes has no WebCrypto `subtle`, so hashing is done in pure JS.
const { Buffer } = require('buffer');
const { sha1 } = require('@noble/hashes/legacy.js');
const { sha256, sha512 } = require('@noble/hashes/sha2.js');
const { pbkdf2 } = require('@noble/hashes/pbkdf2.js');
const { createCipheriv, createDecipheriv } = require('telegram/crypto/crypto');

const hashes = { sha1, sha256, sha512 };

function randomBytes(count) {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes);
}

function createHash(algorithm) {
  const fn = hashes[algorithm];
  if (!fn) throw new Error(`Unsupported hash: ${algorithm}`);
  let data = new Uint8Array(0);
  return {
    update(chunk) {
      data = new Uint8Array(chunk);
      return this;
    },
    digest() {
      return Buffer.from(fn(data));
    },
  };
}

function pbkdf2Sync(password, salt, iterations, keyLength, digest) {
  return Buffer.from(
    pbkdf2(hashes[digest], new Uint8Array(password), new Uint8Array(salt), {
      c: iterations,
      dkLen: keyLength,
    }),
  );
}

module.exports = { randomBytes, createHash, pbkdf2Sync, createCipheriv, createDecipheriv };
