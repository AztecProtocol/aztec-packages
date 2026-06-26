import { Fr } from '@aztec/foundation/curves/bn254';

import { bufferAsFields, bufferFromFields } from './buffer.js';

describe('buffer', () => {
  it('converts buffer back and forth from fields', () => {
    const buffer = Buffer.from('1234567890abcdef'.repeat(10), 'hex');
    const fields = bufferAsFields(buffer, 20);
    expect(bufferFromFields(fields).toString('hex')).toEqual(buffer.toString('hex'));
  });

  it('throws if max length is exceeded', () => {
    const buffer = Buffer.from('1234567890abcdef'.repeat(10), 'hex');
    expect(() => bufferAsFields(buffer, 3)).toThrow(/exceeds maximum size/);
  });

  it('pads with zeros when declared length exceeds payload', () => {
    // Create a small buffer, encode it, then truncate the field array before decoding.
    const buffer = Buffer.from('aabbccdd', 'hex'); // 4 bytes
    const fields = bufferAsFields(buffer, 10);
    // Declared length is 4 bytes, stored in fields[0]. Payload fields follow.
    // Artificially inflate the declared length to 62 bytes (2 full fields).

    const inflatedFields = [new Fr(62), ...fields.slice(1)];
    const result = bufferFromFields(inflatedFields);
    // Result should be exactly 62 bytes: original 4 bytes followed by 58 zero bytes.
    expect(result.length).toBe(62);
    expect(result.subarray(0, 4).toString('hex')).toEqual('aabbccdd');
    expect(result.subarray(4).every(b => b === 0)).toBe(true);
  });

  it('pads with zeros when payload fields are truncated', () => {
    // Simulate the blob reconstruction scenario: declared length says 93 bytes (3 fields),
    // but only 1 payload field is present.

    const payloadField = Fr.fromBuffer(
      Buffer.from('00' + 'ab'.repeat(31), 'hex'), // 31 bytes of 0xab
    );
    // Declared length = 93 bytes (would need 3 fields), but only 1 field in payload.
    const fields = [new Fr(93), payloadField];
    const result = bufferFromFields(fields);
    expect(result.length).toBe(93);
    // First 31 bytes come from the single payload field.
    expect(result.subarray(0, 31).every(b => b === 0xab)).toBe(true);
    // Remaining 62 bytes are zero-padded.
    expect(result.subarray(31).every(b => b === 0)).toBe(true);
  });

  it('returns exact buffer when payload matches declared length', () => {
    const buffer = Buffer.from('ff'.repeat(31), 'hex'); // exactly 1 field of payload
    const fields = bufferAsFields(buffer, 5);
    const result = bufferFromFields(fields);
    expect(result.length).toBe(31);
    expect(result.toString('hex')).toEqual(buffer.toString('hex'));
  });

  it('returns an empty buffer for an empty field array', () => {
    const result = bufferFromFields([]);
    expect(result.length).toBe(0);
  });
});
