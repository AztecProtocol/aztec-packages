'use strict';
/**
 * Built-ins the stack (or its dependencies) uses that Hermes lacks, each installed only when missing:
 * structuredClone, the ES2025 Set methods, Promise.withResolvers, Object.groupBy / Map.groupBy, Array.fromAsync,
 * Array / TypedArray toSorted, and a UTF-8 TextDecoder. On Hermes it also replaces TypedArray#subarray (see
 * fastSubarray) and gives the `buffer` package's UTF-8 and base64 conversions native implementations (see
 * speedUpBuffer).
 */
const { structuredClonePolyfill } = require('./structured_clone');

function define(target, name, value) {
  if (typeof target[name] !== 'function') {
    Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
  }
}

function installPolyfills() {
  define(globalThis, 'structuredClone', structuredClonePolyfill);

  const SetProto = Set.prototype;
  const keysOf = other => {
    if (other == null || typeof other.has !== 'function' || typeof other.keys !== 'function') {
      throw new TypeError('Set method: the argument must be set-like');
    }
    return other;
  };
  define(SetProto, 'union', function (other) {
    const result = new Set(this);
    for (const v of keysOf(other).keys()) result.add(v);
    return result;
  });
  define(SetProto, 'intersection', function (other) {
    const o = keysOf(other);
    const result = new Set();
    for (const v of this) if (o.has(v)) result.add(v);
    return result;
  });
  define(SetProto, 'difference', function (other) {
    const o = keysOf(other);
    const result = new Set();
    for (const v of this) if (!o.has(v)) result.add(v);
    return result;
  });
  define(SetProto, 'symmetricDifference', function (other) {
    const o = keysOf(other);
    const result = new Set(this);
    for (const v of o.keys()) {
      if (this.has(v)) result.delete(v);
      else result.add(v);
    }
    return result;
  });
  define(SetProto, 'isSubsetOf', function (other) {
    const o = keysOf(other);
    for (const v of this) if (!o.has(v)) return false;
    return true;
  });
  define(SetProto, 'isSupersetOf', function (other) {
    for (const v of keysOf(other).keys()) if (!this.has(v)) return false;
    return true;
  });
  define(SetProto, 'isDisjointFrom', function (other) {
    const o = keysOf(other);
    for (const v of this) if (o.has(v)) return false;
    return true;
  });

  define(Promise, 'withResolvers', function () {
    let resolve;
    let reject;
    const promise = new this((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  });

  define(Object, 'groupBy', function (items, keyOf) {
    const groups = Object.create(null);
    let i = 0;
    for (const item of items) {
      const key = keyOf(item, i++);
      (groups[key] ??= []).push(item);
    }
    return groups;
  });
  define(Map, 'groupBy', function (items, keyOf) {
    const groups = new Map();
    let i = 0;
    for (const item of items) {
      const key = keyOf(item, i++);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  });
  define(Array, 'fromAsync', async function (items, mapFn, thisArg) {
    const result = [];
    let i = 0;
    const iterable = items[Symbol.asyncIterator] ? items : (items[Symbol.iterator] ? items : Array.from(items));
    for await (const item of iterable) {
      result.push(mapFn ? await mapFn.call(thisArg, item, i++) : item);
    }
    return result;
  });
  define(Array.prototype, 'toSorted', function (compare) {
    return Array.prototype.slice.call(this).sort(compare);
  });
  const TypedArrayProto = Object.getPrototypeOf(Uint8Array.prototype);
  define(TypedArrayProto, 'toSorted', function (compare) {
    return this.slice().sort(compare);
  });

  if (typeof globalThis.TextDecoder !== 'function') {
    globalThis.TextDecoder = Utf8Decoder;
  }

  if (typeof globalThis.HermesInternal !== 'undefined') {
    Object.defineProperty(TypedArrayProto, 'subarray', {
      value: fastSubarray,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    speedUpBuffer(require('buffer').Buffer);
  }
}

/**
 * The `buffer` package converts strings in JavaScript, byte by byte through arrays, which on Hermes (no JIT) is
 * most of the time a PXE spends turning contract artifacts to and from Buffers. Its UTF-8 and base64 cases go to
 * Hermes's TextEncoder and @aztec-foundation/react-native's native decoders instead; the results are the same.
 */
function speedUpBuffer(Buffer) {
  const native = globalThis.__aztecReactNative;
  if (native === undefined || Buffer.__aztecNative) {
    return;
  }
  Buffer.__aztecNative = true;
  const encoder = new TextEncoder();
  const isUtf8 = enc => enc === undefined || enc === 'utf8' || enc === 'utf-8';
  const lower = enc => (typeof enc === 'string' ? enc.toLowerCase() : enc);
  const view = bytes => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const from = Buffer.from;
  Buffer.from = function (value, encodingOrOffset, length) {
    if (typeof value === 'string') {
      const enc = lower(encodingOrOffset);
      if (isUtf8(enc)) return view(encoder.encode(value));
      if (enc === 'base64' || enc === 'base64url') return view(native.base64Decode(value));
    }
    return from.call(this, value, encodingOrOffset, length);
  };

  const byteLength = Buffer.byteLength;
  Buffer.byteLength = function (value, encoding) {
    if (typeof value === 'string' && isUtf8(lower(encoding))) return encoder.encode(value).length;
    return byteLength.call(this, value, encoding);
  };

  const toString = Buffer.prototype.toString;
  Buffer.prototype.toString = function (encoding, start, end) {
    const enc = lower(encoding);
    if (isUtf8(enc) || enc === 'base64') {
      const length = this.length;
      const s = start === undefined || start < 0 ? 0 : Math.min(start | 0, length);
      const e = end === undefined || end > length ? length : end | 0;
      if (e <= s) return '';
      const bytes = new Uint8Array(this.buffer, this.byteOffset + s, e - s);
      return enc === 'base64' ? native.base64Encode(bytes) : native.decodeUtf8(bytes, false);
    }
    return toString.apply(this, arguments);
  };
}

/**
 * TypedArray#subarray for Hermes, whose own takes time proportional to the view's length (msgpackr takes a view of
 * its whole remaining buffer for every string it writes), and ignores Symbol.species, so a Buffer's subarray is a
 * plain Uint8Array where V8 gives a Buffer. A view made with the array's own constructor is neither.
 */
function fastSubarray(begin, end) {
  const length = this.length;
  const clamp = (value, fallback) => {
    if (value === undefined) return fallback;
    const n = Math.trunc(Number(value)) || 0;
    return n < 0 ? Math.max(length + n, 0) : Math.min(n, length);
  };
  const start = clamp(begin, 0);
  const count = Math.max(clamp(end, length) - start, 0);
  return new this.constructor(this.buffer, this.byteOffset + start * this.BYTES_PER_ELEMENT, count);
}

/** TextDecoder for UTF-8 (the only encoding the stack decodes), with `fatal` and BOM handling. */
class Utf8Decoder {
  constructor(label = 'utf-8', options = {}) {
    const name = String(label).toLowerCase();
    if (name !== 'utf-8' && name !== 'utf8' && name !== 'unicode-1-1-utf-8') {
      throw new RangeError(`TextDecoder: unsupported encoding ${label}`);
    }
    this.encoding = 'utf-8';
    this.fatal = !!options.fatal;
    this.ignoreBOM = !!options.ignoreBOM;
  }

  decode(input) {
    if (input === undefined) return '';
    let bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    let i = 0;
    if (!this.ignoreBOM && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
    const native = globalThis.__aztecReactNative;
    if (native !== undefined) {
      if (i > 0) bytes = new Uint8Array(bytes.buffer, bytes.byteOffset + i, bytes.length - i);
      try {
        return native.decodeUtf8(bytes, this.fatal);
      } catch (err) {
        throw new TypeError(`TextDecoder: ${err.message}`);
      }
    }
    const units = [];
    let out = '';
    const bad = () => {
      if (this.fatal) throw new TypeError('TextDecoder: the encoded data was not valid utf-8');
      units.push(0xfffd);
    };
    while (i < bytes.length) {
      const b = bytes[i];
      let need = 0;
      let cp = 0;
      let min = 0;
      if (b < 0x80) {
        units.push(b);
        i++;
      } else {
        if (b >= 0xc2 && b <= 0xdf) [need, cp, min] = [1, b & 0x1f, 0x80];
        else if (b >= 0xe0 && b <= 0xef) [need, cp, min] = [2, b & 0x0f, 0x800];
        else if (b >= 0xf0 && b <= 0xf4) [need, cp, min] = [3, b & 0x07, 0x10000];
        else {
          bad();
          i++;
          continue;
        }
        let j = 1;
        for (; j <= need; j++) {
          const c = bytes[i + j];
          if (c === undefined || (c & 0xc0) !== 0x80) break;
          cp = (cp << 6) | (c & 0x3f);
        }
        if (j <= need || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
          bad();
          i += Math.max(1, j);
          continue;
        }
        if (cp >= 0x10000) {
          cp -= 0x10000;
          units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
          units.push(cp);
        }
        i += need + 1;
      }
      if (units.length >= 8192) {
        out += String.fromCharCode.apply(null, units);
        units.length = 0;
      }
    }
    return out + String.fromCharCode.apply(null, units);
  }
}

module.exports = { installPolyfills, Utf8Decoder };
