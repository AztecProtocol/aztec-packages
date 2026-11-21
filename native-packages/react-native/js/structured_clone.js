'use strict';
/**
 * structuredClone for engines without it (Hermes): the structured clone algorithm's data types (primitives,
 * bigints, plain objects and arrays, Date, RegExp, Map, Set, ArrayBuffer and its views, Error), with shared
 * and cyclic references kept. As with the real one, class instances come out as plain objects and functions
 * are refused.
 */
function structuredClonePolyfill(value) {
  const seen = new Map();

  function clone(v) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol') {
        throw new TypeError(`structuredClone: ${typeof v} could not be cloned`);
      }
      return v;
    }
    if (seen.has(v)) {
      return seen.get(v);
    }
    let out;
    if (Array.isArray(v)) {
      out = new Array(v.length);
      seen.set(v, out);
      for (let i = 0; i < v.length; i++) {
        if (i in v) out[i] = clone(v[i]);
      }
      return out;
    }
    if (v instanceof Date) {
      out = new Date(v.getTime());
    } else if (v instanceof RegExp) {
      out = new RegExp(v.source, v.flags);
    } else if (v instanceof ArrayBuffer) {
      out = v.slice(0);
    } else if (ArrayBuffer.isView(v)) {
      const buffer = clone(v.buffer);
      if (v instanceof DataView) {
        out = new DataView(buffer, v.byteOffset, v.byteLength);
      } else {
        // A Buffer (or other subclass) comes back as its base typed array, as structuredClone gives.
        let Ctor = v.constructor;
        while (Ctor && Object.getPrototypeOf(Ctor) && Object.getPrototypeOf(Ctor).name !== 'TypedArray') {
          Ctor = Object.getPrototypeOf(Ctor);
        }
        out = new Ctor(buffer, v.byteOffset, v.length);
      }
    } else if (v instanceof Map) {
      out = new Map();
      seen.set(v, out);
      for (const [k, item] of v) out.set(clone(k), clone(item));
      return out;
    } else if (v instanceof Set) {
      out = new Set();
      seen.set(v, out);
      for (const item of v) out.add(clone(item));
      return out;
    } else if (v instanceof Error) {
      out = new Error(v.message);
      out.name = v.name;
      if (v.stack !== undefined) out.stack = v.stack;
      if ('cause' in v) out.cause = clone(v.cause);
    } else if (typeof v === 'object' && v[Symbol.toStringTag] === 'Promise') {
      throw new TypeError('structuredClone: a Promise could not be cloned');
    } else {
      out = {};
      seen.set(v, out);
      for (const key of Object.keys(v)) {
        out[key] = clone(v[key]);
      }
      return out;
    }
    seen.set(v, out);
    return out;
  }

  return clone(value);
}

module.exports = { structuredClonePolyfill };
