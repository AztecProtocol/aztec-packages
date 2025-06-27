import { IncludeByTimestamp } from './include_by_timestamp.js';

describe('IncludeByTimestamp', () => {
  it('serializes and deserializes empty', () => {
    const empty = IncludeByTimestamp.empty();
    expect(empty.isEmpty()).toBe(true);
    expect(empty.isSome).toBe(false);
    expect(empty.value).toBe(0n);
  });

  it('serializes and deserializes with value', () => {
    const timestamp = new IncludeByTimestamp(true, 123n);
    const buffer = timestamp.toBuffer();
    const deserialized = IncludeByTimestamp.fromBuffer(buffer);
    expect(deserialized.isSome).toBe(true);
    expect(deserialized.value).toBe(123n);
  });

  it('serializes and deserializes fields', () => {
    const timestamp = new IncludeByTimestamp(true, 456n);
    const fields = timestamp.toFields();
    const deserialized = IncludeByTimestamp.fromFields(fields);
    expect(deserialized.isSome).toBe(true);
    expect(deserialized.value).toBe(456n);
  });

  it('throws on invalid u64 value', () => {
    const tooLarge = 2n ** 64n;
    expect(() => new IncludeByTimestamp(true, tooLarge)).toThrow('Value is not a u64.');
  });
});
