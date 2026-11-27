/** Random bytes from crypto.getRandomValues, which @aztec-foundation/react-native provides on Hermes. */
export const randomBytes = (len: number) => {
  const crypto = (globalThis as { crypto?: { getRandomValues<T extends Uint8Array>(array: T): T } }).crypto;
  if (!crypto?.getRandomValues) {
    throw new Error('randomBytes: no crypto.getRandomValues (import @aztec-foundation/react-native first)');
  }
  const buf = new Uint8Array(len);
  // getRandomValues fills at most 65536 bytes per call.
  for (let offset = 0; offset < len; offset += 65536) {
    crypto.getRandomValues(buf.subarray(offset, Math.min(len, offset + 65536)));
  }
  return buf;
};
