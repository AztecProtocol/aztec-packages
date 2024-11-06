import { jsonStringify } from '@aztec/foundation/json-rpc';

import { PackedValues } from './packed_values.js';

describe('PackedValues', () => {
  it('serializes and deserializes', () => {
    const values = PackedValues.random();
    const json = jsonStringify(values);
    expect(PackedValues.schema.parse(JSON.parse(json))).toEqual(values);
  });
});
