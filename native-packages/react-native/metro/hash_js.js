'use strict';
// hash.js with its SHA-256 computed by @aztec-foundation/react-native's native SHA-256: hash.js's JavaScript one is
// slow on Hermes, which has no JIT, and the stack hashes every contract artifact with it. Everything else is
// hash.js's own. withAztec resolves `hash.js` here, except from this file.
const real = require('hash.js');

function nativeSha256(bytes) {
  const native = globalThis.__aztecReactNative;
  if (native === undefined) {
    throw new Error("hash.js: import '@aztec-foundation/react-native' before the rest of the app");
  }
  return native.sha256(bytes);
}

function Sha256() {
  if (!(this instanceof Sha256)) return new Sha256();
  this.chunks = [];
}
Sha256.blockSize = 512;
Sha256.outSize = 256;
Sha256.hmacStrength = 192;
Sha256.padLength = 64;

Sha256.prototype.update = function update(msg, enc) {
  if (ArrayBuffer.isView(msg)) {
    this.chunks.push(new Uint8Array(msg.buffer.slice(msg.byteOffset, msg.byteOffset + msg.byteLength)));
  } else {
    this.chunks.push(Uint8Array.from(real.utils.toArray(msg, enc)));
  }
  return this;
};

Sha256.prototype.digest = function digest(enc) {
  let total = 0;
  for (const chunk of this.chunks) total += chunk.length;
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of this.chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  const out = Array.from(nativeSha256(all));
  return enc === 'hex' ? real.utils.toHex(out) : out;
};

module.exports = Object.assign(Object.create(null), real, {
  sha256: Sha256,
  sha: Object.assign(Object.create(null), real.sha, { sha256: Sha256 }),
});
