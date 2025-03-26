/**
 * Convert a 32-byte BE Buffer to a BigInt.
 */
export function buffer32BytesToBigIntBE(buf: Buffer): bigint {
  return (
    (buf.readBigUInt64BE(0) << 192n) +
    (buf.readBigUInt64BE(8) << 128n) +
    (buf.readBigUInt64BE(16) << 64n) +
    buf.readBigUInt64BE(24)
  );
}

/**
 * Convert a BE Uint8Array to a BigInt.
 */
export function uint8ArrayToBigIntBE(bytes: Uint8Array): bigint {
  const buffer = Buffer.from(bytes);
  return buffer32BytesToBigIntBE(buffer);
}

/**
 * Convert a BigInt to a 32-byte BE Buffer.
 */
export function bigIntToBufferBE(value: bigint, byteLength = 32): Buffer {
  if (byteLength != 32) {
    throw new Error(
      `Only 32 bytes supported for conversion from bigint to buffer, attempted byte length: ${byteLength}`,
    );
  }
  const buf = Buffer.alloc(byteLength);
  buf.writeBigUInt64BE(value >> 192n, 0);
  buf.writeBigUInt64BE((value >> 128n) & 0xffffffffffffffffn, 8);
  buf.writeBigUInt64BE((value >> 64n) & 0xffffffffffffffffn, 16);
  buf.writeBigUInt64BE(value & 0xffffffffffffffffn, 24);
  return buf;
}

/**
 * Convert a BigInt to a 32-byte BE Uint8Array.
 */
export function bigIntToUint8ArrayBE(value: bigint, byteLength = 32): Uint8Array {
  return new Uint8Array(bigIntToBufferBE(value, byteLength));
}
