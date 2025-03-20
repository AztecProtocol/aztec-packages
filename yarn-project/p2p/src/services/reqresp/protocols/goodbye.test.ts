import { GoodByeReason, decodeGoodbyeReason, encodeGoodbyeReason } from './goodbye.js';

describe('goodbye', () => {
  it('should encode and decode goodbye reason', () => {
    const reason = GoodByeReason.SHUTDOWN;
    const encoded = encodeGoodbyeReason(reason);
    const decoded = decodeGoodbyeReason(encoded);
    expect(decoded).toBe(reason);
  });

  it('should return unknown if the goodbye reason buffer length is invalid', () => {
    const invalidBuffer = Buffer.from([0x1, 0x2]);
    expect(decodeGoodbyeReason(invalidBuffer)).toBe(GoodByeReason.UNKNOWN);
  });
});
