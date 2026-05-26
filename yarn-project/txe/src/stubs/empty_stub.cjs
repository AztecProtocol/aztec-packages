// CommonJS stub used by the TXE bundle to replace `@aztec/*` packages that AztecNodeService
// imports but the TXE worker never actually executes. Every named import resolves via the
// Proxy to a callable that throws on use, so accidental runtime evaluation surfaces a loud
// error instead of silently returning `undefined`. Type-level references and constructor
// arguments we pass explicitly (DummyP2P, TXEArchiver, MockEpochCache, etc.) are unaffected.
'use strict';

const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return target;
    if (typeof prop === 'symbol') return target[prop];
    if (!(prop in target)) {
      // Cache so referential identity is stable across repeated lookups.
      target[prop] = new Proxy(function stubbed() {
        throw new Error(
          `TXE stub: tried to use '${String(prop)}' from a stubbed @aztec/* package. ` +
            `If TXE truly needs this, remove it from the stub list in esbuild.config.mjs.`,
        );
      }, handler);
    }
    return target[prop];
  },
};

module.exports = new Proxy({}, handler);
