import { Fr } from '../curves/bn254/field.js';
import { deserializeArrayFromVector, deserializeField, serializeArrayOfBufferableToVector } from './serialize.js';

describe('deserializeArrayFromVector', () => {
  it('round-trips an array of fields', () => {
    const fields = Array.from({ length: 3 }, () => Fr.random().toBuffer());
    const vector = serializeArrayOfBufferableToVector(fields);
    const { elem, adv } = deserializeArrayFromVector(deserializeField, vector);
    expect(elem).toEqual(fields);
    expect(adv).toEqual(vector.length);
  });

  it('round-trips an empty array', () => {
    const vector = serializeArrayOfBufferableToVector([]);
    expect(deserializeArrayFromVector(deserializeField, vector)).toEqual({ elem: [], adv: 4 });
  });

  it('deserializes from an offset within a larger buffer', () => {
    const fields = Array.from({ length: 2 }, () => Fr.random().toBuffer());
    const vector = Buffer.concat([Buffer.alloc(8), serializeArrayOfBufferableToVector(fields), Buffer.alloc(8)]);
    const { elem, adv } = deserializeArrayFromVector(deserializeField, vector, 8);
    expect(elem).toEqual(fields);
    expect(adv).toEqual(4 + 32 * 2);
  });

  it('rejects a length larger than the bytes left in the buffer', () => {
    // Four bytes declaring 1,000,000 elements, with no payload at all.
    const vector = Buffer.from('AA9CQA==', 'base64');
    expect(() => deserializeArrayFromVector(deserializeField, vector)).toThrow(
      'Serialized array length 1000000 exceeds remaining buffer length 0',
    );
  });

  it('rejects the largest length a 32 bit prefix can encode', () => {
    const vector = Buffer.from('/////w==', 'base64');
    expect(() => deserializeArrayFromVector(deserializeField, vector)).toThrow(
      'Serialized array length 4294967295 exceeds remaining buffer length 0',
    );
  });

  it('bounds the length by the bytes after the offset, not by the whole buffer', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(200);
    const vector = Buffer.concat([Buffer.alloc(1000), header, Buffer.alloc(100)]);
    expect(() => deserializeArrayFromVector(deserializeField, vector, 1000)).toThrow(
      'Serialized array length 200 exceeds remaining buffer length 100',
    );
  });

  it('rejects a truncated length prefix', () => {
    expect(() => deserializeArrayFromVector(deserializeField, Buffer.alloc(2))).toThrow();
  });
});
