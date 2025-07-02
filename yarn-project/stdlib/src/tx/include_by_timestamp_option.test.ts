import { INCLUDE_BY_TIMESTAMP_OPTION_LENGTH } from '@aztec/constants';

import { IncludeByTimestampOption } from './include_by_timestamp_option.js';

describe('IncludeByTimestamp', () => {
  it('serializes and deserializes empty', () => {
    const empty = IncludeByTimestampOption.empty();
    expect(empty.isEmpty()).toBe(true);
    expect(empty.isSome).toBe(false);
    expect(empty.value).toBe(0n);
  });

  it('serializes and deserializes with value', () => {
    const timestamp = new IncludeByTimestampOption(true, 123n);
    const buffer = timestamp.toBuffer();
    const deserialized = IncludeByTimestampOption.fromBuffer(buffer);
    expect(deserialized.isSome).toBe(true);
    expect(deserialized.value).toBe(123n);
  });

  it('serializes and deserializes fields', () => {
    const timestamp = new IncludeByTimestampOption(true, 456n);
    const fields = timestamp.toFields();
    expect(fields.length).toBe(INCLUDE_BY_TIMESTAMP_OPTION_LENGTH);

    const deserialized = IncludeByTimestampOption.fromFields(fields);
    expect(deserialized.isSome).toBe(true);
    expect(deserialized.value).toBe(456n);
  });

  it('throws on invalid u64 value', () => {
    const tooLarge = 2n ** 64n;
    expect(() => new IncludeByTimestampOption(true, tooLarge)).toThrow('Value is not a u64.');
  });
});
