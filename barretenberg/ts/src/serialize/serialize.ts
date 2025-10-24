// For serializing bool.
export function boolToBuffer(b: boolean) {
  const buf = new Uint8Array(1);
  buf[0] = b ? 1 : 0;
  return buf;
}

// For serializing numbers to 32 bit big-endian form.
export function numToUInt32BE(n: number, bufferSize = 4) {
  const buf = new Uint8Array(bufferSize);
  new DataView(buf.buffer).setUint32(buf.byteLength - 4, n, false);
  return buf;
}

// For serializing signed numbers to 32 bit big-endian form.
export function numToInt32BE(n: number, bufferSize = 4) {
  const buf = new Uint8Array(bufferSize);
  new DataView(buf.buffer).setInt32(buf.byteLength - 4, n, false);
  return buf;
}

export function concatenateUint8Arrays(arrayOfUint8Arrays: Uint8Array[]) {
  const totalLength = arrayOfUint8Arrays.reduce((prev, curr) => prev + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let length = 0;
  for (const array of arrayOfUint8Arrays) {
    result.set(array, length);
    length += array.length;
  }
  return result;
}

// For serializing a buffer as a vector.
export function serializeBufferToVector(buf: Uint8Array) {
  return concatenateUint8Arrays([numToInt32BE(buf.length), buf]);
}

export function serializeBigInt(n: bigint, width = 32) {
  const buf = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    buf[width - i - 1] = Number((n >> BigInt(i * 8)) & 0xffn);
  }
  return buf;
}

// For serializing an array of fixed length elements.
export function serializeBufferArrayToVector(arr: Uint8Array[]) {
  return concatenateUint8Arrays([numToUInt32BE(arr.length), ...arr.flat()]);
}

/** A type that can be written to a buffer. */
export type Bufferable = boolean | Uint8Array | number | string | { toBuffer: () => Uint8Array } | Bufferable[];

/**
 * Serializes a list of objects contiguously for calling into wasm.
 * @param objs - Objects to serialize.
 * @returns A buffer list with the concatenation of all fields.
 */
export function serializeBufferable(obj: Bufferable): Uint8Array {
  if (Array.isArray(obj)) {
    return serializeBufferArrayToVector(obj.map(serializeBufferable));
  } else if (obj instanceof Uint8Array) {
    return serializeBufferToVector(obj);
  } else if (typeof obj === 'boolean') {
    return boolToBuffer(obj);
  } else if (typeof obj === 'number') {
    return numToUInt32BE(obj);
  } else if (typeof obj === 'bigint') {
    return serializeBigInt(obj);
  } else if (typeof obj === 'string') {
    return serializeBufferToVector(new TextEncoder().encode(obj));
  } else {
    return obj.toBuffer();
  }
}
