import { jsonStringify } from '@aztec/foundation/json-rpc';

import { HashedValues } from './hashed_values.js';

describe('HashedValues', () => {
  it('serializes and deserializes', async () => {
    const values = HashedValues.random();
    const json = jsonStringify(values);
    await expect(HashedValues.schema.parseAsync(JSON.parse(json))).resolves.toEqual(values);
  });
});
