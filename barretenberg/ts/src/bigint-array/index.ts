export function toBigIntBE(bytes: Uint8Array) {
  // A Buffer in node, *is* a Uint8Array. We can't refuse it's type.
  // However the algo below only works on an actual Uint8Array, hence we make a new one to be safe.
  bytes = new Uint8Array(bytes);
  let bigint = BigInt(0);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    bigint = (bigint << BigInt(8)) + BigInt(view.getUint8(i));
  }
  return bigint;
}

export function bufToBigIntBE(buf: Buffer) {
  return (
    (buf.readBigInt64BE(0) << 192n) +
    (buf.readBigInt64BE(8) << 128n) +
    (buf.readBigInt64BE(16) << 64n) +
    buf.readBigInt64BE(24)
  );
}

export function toBufferBE(value: bigint, byteLength = 32): Buffer {
  const buf = Buffer.alloc(byteLength);
  buf.writeBigUInt64BE(value >> 192n, 0);
  buf.writeBigUInt64BE((value >> 128n) & 0xffffffffffffffffn, 8);
  buf.writeBigUInt64BE((value >> 64n) & 0xffffffffffffffffn, 16);
  buf.writeBigUInt64BE(value & 0xffffffffffffffffn, 24);
  return buf;
}
