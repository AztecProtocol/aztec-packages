import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { HashedValues } from './hashed_values.js';

describe('HashedValues', () => {
  it('serializes and deserializes', async () => {
    const values = HashedValues.random();
    const json = jsonStringify(values);
    await expect(HashedValues.schema.parseAsync(JSON.parse(json))).resolves.toEqual(values);
  });

  describe('schemaFor', () => {
    const parseWithValueCount = (maxValues: number | undefined, count: number) =>
      HashedValues.schemaFor(maxValues).parseAsync(
        JSON.parse(
          jsonStringify(
            new HashedValues(
              times(count, i => new Fr(i)),
              Fr.ZERO,
            ),
          ),
        ),
      );

    it('accepts up to the requested number of values', async () => {
      await expect(parseWithValueCount(10, 10)).resolves.toHaveProperty('values.length', 10);
    });

    it('rejects more than the requested number of values', async () => {
      await expect(parseWithValueCount(10, 11)).rejects.toThrow(expect.objectContaining({ name: 'ZodError' }));
    });

    it('accepts any number of values when unbounded', async () => {
      await expect(parseWithValueCount(undefined, 500)).resolves.toHaveProperty('values.length', 500);
    });
  });
});
