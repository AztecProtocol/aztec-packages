// Complete browser-compatible Buffer polyfill
// Based on the buffer package but simplified for browser use

const K_MAX_LENGTH = 0x7fffffff;
const K_STRING_MAX_LENGTH = (1 << 28) - 16;

class BufferPolyfill extends Uint8Array {
  constructor(arg, encodingOrOffset, length) {
    if (typeof arg === 'number') {
      if (arg < 0 || arg > K_MAX_LENGTH) {
        throw new RangeError('Invalid array buffer length');
      }
      super(arg);
    } else if (typeof arg === 'string') {
      super(byteLength(arg, encodingOrOffset || 'utf8'));
      write(this, arg, 0, this.length, encodingOrOffset || 'utf8');
    } else if (ArrayBuffer.isView(arg)) {
      super(arg.buffer, arg.byteOffset, arg.byteLength);
    } else if (arg instanceof ArrayBuffer) {
      super(arg, encodingOrOffset, length);
    } else if (Array.isArray(arg)) {
      super(arg);
    } else if (arg === null || arg === undefined) {
      super(0);
    } else {
      throw new TypeError('Invalid argument type');
    }
  }

  get parent() {
    return this.buffer;
  }

  get offset() {
    return this.byteOffset;
  }

  toString(encoding = 'utf8', start = 0, end = this.length) {
    if (start < 0) start = 0;
    if (end > this.length) end = this.length;
    if (start >= end) return '';

    const slice = this.subarray(start, end);

    switch (encoding.toLowerCase()) {
      case 'hex':
        return Array.from(slice, b => b.toString(16).padStart(2, '0')).join('');
      case 'utf8':
      case 'utf-8':
        return new TextDecoder('utf-8').decode(slice);
      case 'base64':
        let binary = '';
        for (let i = 0; i < slice.length; i++) {
          binary += String.fromCharCode(slice[i]);
        }
        return btoa(binary);
      case 'latin1':
      case 'binary':
        return Array.from(slice, b => String.fromCharCode(b)).join('');
      default:
        throw new TypeError('Unknown encoding: ' + encoding);
    }
  }

  toJSON() {
    return {
      type: 'Buffer',
      data: Array.from(this)
    };
  }

  slice(start, end) {
    const newBuf = super.slice(start, end);
    Object.setPrototypeOf(newBuf, BufferPolyfill.prototype);
    return newBuf;
  }

  subarray(start, end) {
    const newBuf = super.subarray(start, end);
    Object.setPrototypeOf(newBuf, BufferPolyfill.prototype);
    return newBuf;
  }

  write(string, offset, length, encoding) {
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    } else if (isFinite(offset)) {
      offset = offset >>> 0;
      if (isFinite(length)) {
        length = length >>> 0;
        if (encoding === undefined) encoding = 'utf8';
      } else {
        encoding = length;
        length = undefined;
      }
    }

    const remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    return write(this, string, offset, length, encoding);
  }

  equals(other) {
    if (!BufferPolyfill.isBuffer(other)) {
      throw new TypeError('Argument must be a Buffer');
    }
    if (this === other) return true;
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  }

  compare(target, start, end, thisStart, thisEnd) {
    if (!BufferPolyfill.isBuffer(target)) {
      throw new TypeError('Argument must be a Buffer');
    }

    if (start === undefined) start = 0;
    if (end === undefined) end = target.length;
    if (thisStart === undefined) thisStart = 0;
    if (thisEnd === undefined) thisEnd = this.length;

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index');
    }

    if (thisStart >= thisEnd && start >= end) return 0;
    if (thisStart >= thisEnd) return -1;
    if (start >= end) return 1;

    const x = this.subarray(thisStart, thisEnd);
    const y = target.subarray(start, end);
    const len = Math.min(x.length, y.length);

    for (let i = 0; i < len; i++) {
      if (x[i] !== y[i]) {
        return x[i] < y[i] ? -1 : 1;
      }
    }

    return x.length < y.length ? -1 : (x.length > y.length ? 1 : 0);
  }

  fill(val, start, end, encoding) {
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string');
      }
      if (typeof encoding === 'string' && !BufferPolyfill.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding);
      }
      if (val.length === 1) {
        const code = val.charCodeAt(0);
        if ((encoding === 'utf8' && code < 128) ||
            encoding === 'latin1') {
          val = code;
        }
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index');
    }

    if (end <= start) {
      return this;
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    if (typeof val === 'number') {
      for (let i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      const bytes = BufferPolyfill.isBuffer(val)
        ? val
        : BufferPolyfill.from(val, encoding);
      const len = bytes.length;
      for (let i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this;
  }
}

// Static methods
BufferPolyfill.from = function (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return new BufferPolyfill(value, encodingOrOffset);
  }

  if (ArrayBuffer.isView(value)) {
    const copy = new BufferPolyfill(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy;
  }

  if (value == null) {
    throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object');
  }

  if (value instanceof ArrayBuffer) {
    return new BufferPolyfill(value, encodingOrOffset, length);
  }

  if (Array.isArray(value) || (value && typeof value === 'object' && typeof value.length === 'number')) {
    const copy = new BufferPolyfill(value.length);
    for (let i = 0; i < value.length; i++) {
      copy[i] = value[i];
    }
    return copy;
  }

  throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object');
};

BufferPolyfill.alloc = function (size, fill, encoding) {
  const buf = new BufferPolyfill(size);
  if (fill !== undefined) {
    if (encoding !== undefined) {
      buf.fill(fill, encoding);
    } else {
      buf.fill(fill);
    }
  }
  return buf;
};

BufferPolyfill.allocUnsafe = function (size) {
  return new BufferPolyfill(size);
};

BufferPolyfill.allocUnsafeSlow = function (size) {
  return new BufferPolyfill(size);
};

BufferPolyfill.isBuffer = function (obj) {
  return obj != null && obj._isBuffer === true;
};

BufferPolyfill.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true;
    default:
      return false;
  }
};

BufferPolyfill.concat = function (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers');
  }

  if (list.length === 0) {
    return BufferPolyfill.alloc(0);
  }

  if (length === undefined) {
    length = 0;
    for (let i = 0; i < list.length; i++) {
      length += list[i].length;
    }
  }

  const buffer = BufferPolyfill.allocUnsafe(length);
  let pos = 0;
  for (let i = 0; i < list.length; i++) {
    const buf = list[i];
    if (!BufferPolyfill.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};

BufferPolyfill.byteLength = byteLength;

BufferPolyfill.prototype._isBuffer = true;

BufferPolyfill.prototype.copy = function (target, targetStart, start, end) {
  if (!BufferPolyfill.isBuffer(target)) {
    throw new TypeError('argument should be a Buffer');
  }

  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  if (end === start) return 0;
  if (target.length === 0 || this.length === 0) return 0;

  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds');
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range');
  if (end < 0) throw new RangeError('sourceEnd out of bounds');

  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  const len = end - start;

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    this.copyWithin(targetStart, start, end);
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    );
  }

  return len;
};

// Helper functions
function byteLength(string, encoding = 'utf8') {
  if (typeof string !== 'string') {
    throw new TypeError('Argument must be a string');
  }

  const len = string.length;
  if (len === 0) return 0;

  switch (encoding.toLowerCase()) {
    case 'utf8':
    case 'utf-8':
      return new TextEncoder().encode(string).length;
    case 'hex':
      return len >>> 1;
    case 'base64':
      return base64ToBytes(string).length;
    case 'latin1':
    case 'binary':
      return len;
    default:
      return new TextEncoder().encode(string).length;
  }
}

function write(buf, string, offset, length, encoding) {
  if (offset === undefined) {
    encoding = 'utf8';
    length = buf.length;
    offset = 0;
  }

  const remaining = buf.length - offset;
  if (length === undefined || length > remaining) {
    length = remaining;
  }

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > buf.length) {
    throw new RangeError('Attempt to write outside buffer bounds');
  }

  encoding = encoding || 'utf8';

  let written;
  switch (encoding.toLowerCase()) {
    case 'hex':
      written = hexWrite(buf, string, offset, length);
      break;
    case 'utf8':
    case 'utf-8':
      written = utf8Write(buf, string, offset, length);
      break;
    case 'latin1':
    case 'binary':
      written = latin1Write(buf, string, offset, length);
      break;
    case 'base64':
      written = base64Write(buf, string, offset, length);
      break;
    default:
      throw new TypeError('Unknown encoding: ' + encoding);
  }

  return written;
}

function hexWrite(buf, string, offset, length) {
  offset = Number(offset) || 0;
  const remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  const strLen = string.length;
  if (length > strLen / 2) {
    length = strLen / 2;
  }

  let i;
  for (i = 0; i < length; ++i) {
    const a = hexCharValueTable[string.charCodeAt(i * 2)];
    const b = hexCharValueTable[string.charCodeAt(i * 2 + 1)];
    if (a === undefined || b === undefined) {
      return i;
    }
    buf[offset + i] = (a << 4) | b;
  }
  return i;
}

function utf8Write(buf, string, offset, length) {
  const bytes = new TextEncoder().encode(string);
  const len = Math.min(length, bytes.length);
  for (let i = 0; i < len; i++) {
    buf[offset + i] = bytes[i];
  }
  return len;
}

function latin1Write(buf, string, offset, length) {
  return blitBuffer(string.split('').map(c => c.charCodeAt(0)), buf, offset, length);
}

function base64Write(buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length);
}

function blitBuffer(src, dst, offset, length) {
  let i;
  for (i = 0; i < length && i < src.length; ++i) {
    dst[i + offset] = src[i];
  }
  return i;
}

function base64ToBytes(str) {
  // Remove non-base64 characters
  str = str.trim().replace(/[^+/0-9A-Za-z-_]/g, '');

  const bin = atob(str);
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

const hexCharValueTable = {
  48: 0, 49: 1, 50: 2, 51: 3, 52: 4, 53: 5, 54: 6, 55: 7, 56: 8, 57: 9,
  65: 10, 66: 11, 67: 12, 68: 13, 69: 14, 70: 15,
  97: 10, 98: 11, 99: 12, 100: 13, 101: 14, 102: 15
};

// Constants
BufferPolyfill.INSPECT_MAX_BYTES = 50;
BufferPolyfill.kMaxLength = K_MAX_LENGTH;
BufferPolyfill.kStringMaxLength = K_STRING_MAX_LENGTH;
BufferPolyfill.constants = {
  MAX_LENGTH: K_MAX_LENGTH,
  MAX_STRING_LENGTH: K_STRING_MAX_LENGTH
};

// Export
export const Buffer = BufferPolyfill;
export const INSPECT_MAX_BYTES = BufferPolyfill.INSPECT_MAX_BYTES;
export const kMaxLength = K_MAX_LENGTH;
export const kStringMaxLength = K_STRING_MAX_LENGTH;
export default Buffer;
