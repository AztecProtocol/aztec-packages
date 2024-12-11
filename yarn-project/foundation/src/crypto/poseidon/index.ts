import { BarretenbergSync, Fr as FrBarretenberg } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Create a poseidon hash (field) from an array of input fields.
 * @param input - The input fields to hash.
 * @returns The poseidon hash.
 */
export function poseidon2Hash(input: Fieldable[]): Fr {
  const inputFields = serializeToFields(input);
  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidon2Hash(
          inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
        )
        .toBuffer(),
    ),
  );
}

/**
 * Create a poseidon hash (field) from an array of input fields and a domain separator.
 * @param input - The input fields to hash.
 * @param separator - The domain separator.
 * @returns The poseidon hash.
 */
export function poseidon2HashWithSeparator(input: Fieldable[], separator: number): Fr {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Fr(separator));
  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidon2Hash(
          inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
        )
        .toBuffer(),
    ),
  );
}

export function poseidon2HashAccumulate(input: Fieldable[]): Fr {
  const inputFields = serializeToFields(input);
  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidon2HashAccumulate(inputFields.map(i => new FrBarretenberg(i.toBuffer())))
        .toBuffer(),
    ),
  );
}

/**
 * Runs a Poseidon2 permutation.
 * @param input the input state. Expected to be of size 4.
 * @returns the output state, size 4.
 */
export function poseidon2Permutation(input: Fieldable[]): Fr[] {
  const inputFields = serializeToFields(input);
  // We'd like this assertion but it's not possible to use it in the browser.
  // assert(input.length === 4, 'Input state must be of size 4');
  const res = BarretenbergSync.getSingleton().poseidon2Permutation(
    inputFields.map(i => new FrBarretenberg(i.toBuffer())),
  );
  // We'd like this assertion but it's not possible to use it in the browser.
  // assert(res.length === 4, 'Output state must be of size 4');
  return res.map(o => Fr.fromBuffer(Buffer.from(o.toBuffer())));
}

export function poseidon2HashBytes(input: Buffer): Fr {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Fr.fromBuffer(fieldBytes));
  }

  return Fr.fromBuffer(
    Buffer.from(
      BarretenbergSync.getSingleton()
        .poseidon2Hash(
          inputFields.map(i => new FrBarretenberg(i.toBuffer())), // TODO(#4189): remove this stupid conversion
        )
        .toBuffer(),
    ),
  );
}
