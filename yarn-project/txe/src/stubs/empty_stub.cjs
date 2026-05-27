'use strict';

const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return target;
    if (typeof prop === 'symbol') return target[prop];
    if (!(prop in target)) {
      target[prop] = new Proxy(function stubbed() {
        throw new Error(`${String(prop)} is stubbed in this bundle; this code path should never run`);
      }, handler);
    }
    return target[prop];
  },
};

module.exports = new Proxy({}, handler);
