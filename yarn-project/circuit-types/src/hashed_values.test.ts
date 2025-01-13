import { jsonStringify } from '@aztec/foundation/json-rpc';

import { HashedValues } from './hashed_values.js';

describe('HashedValues', () => {
  it('serializes and deserializes', () => {
    const values = HashedValues.random();
    const json = jsonStringify(values);
    expect(HashedValues.schema.parse(JSON.parse(json))).toEqual(values);
  });
});
