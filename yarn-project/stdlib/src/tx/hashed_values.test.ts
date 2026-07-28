import { MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS } from '@aztec/constants';
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

  const parseWithValueCount = (count: number) =>
    HashedValues.schema.parseAsync(
      JSON.parse(
        jsonStringify(
          new HashedValues(
            times(count, i => new Fr(i)),
            Fr.ZERO,
          ),
        ),
      ),
    );

  it('accepts as many values as a tx can spend on calldata', async () => {
    await expect(parseWithValueCount(MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS)).resolves.toHaveProperty(
      'values.length',
      MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS,
    );
  });

  it('rejects more values than a tx can spend on calldata', async () => {
    await expect(parseWithValueCount(MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS + 1)).rejects.toThrow(
      expect.objectContaining({ name: 'ZodError' }),
    );
  });
});
