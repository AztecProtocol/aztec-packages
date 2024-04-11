import { BarretenbergSync, Fr as FrBarretenberg } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Create a poseidon hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @param index - The separator index to use for the hash.
 * @returns The poseidon hash.
 */
export function poseidonHash(input: Fieldable[], index = 0): Fr {
  const inputFields = serializeToFields(input);
  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidonHash(
          inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
          index,
        )
        .toBuffer(),
    ),
  );
}
