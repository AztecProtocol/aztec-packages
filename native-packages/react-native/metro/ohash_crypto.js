'use strict';
// ohash's digest (base64url SHA-256 of a string's UTF-8), with @aztec-foundation/react-native's native SHA-256:
// ohash's JavaScript one is slow on Hermes, and the kv-store hashes every value it stores with it. withAztec
// resolves `ohash/crypto` here.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64url(bytes) {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
  }
  return out;
}

function digest(input) {
  const native = globalThis.__aztecReactNative;
  if (native === undefined) {
    throw new Error("ohash: import '@aztec-foundation/react-native' before the rest of the app");
  }
  return base64url(native.sha256(input));
}

module.exports = { digest };
