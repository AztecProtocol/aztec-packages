import { BarretenbergSync } from '@aztec/bb.js';

import { Fr } from '../../../curves/bn254/field.js';
import { type Fieldable, serializeToFields } from '../../../serialize/serialize.js';

/**
 * Create a pedersen commitment (point) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
 */
export function pedersenCommit(input: Buffer[], offset = 0) {
  if (!input.every(i => i.length <= 32)) {
    throw new Error('All Pedersen Commit input buffers must be <= 32 bytes.');
  }
  input = input.map(i => (i.length < 32 ? Buffer.concat([Buffer.alloc(32 - i.length, 0), i]) : i));
  const response = BarretenbergSync.getSingleton().pedersenCommit({
    inputs: input,
    hashIndex: offset,
  });
  return [Buffer.from(response.point.x), Buffer.from(response.point.y)];
}

/**
 * Create a pedersen hash (field) from an array of input fields.
 * @param input - The input fieldables to hash.
 * @param index - The separator index to use for the hash.
 * @returns The pedersen hash.
 */
export function pedersenHash(input: Fieldable[], index = 0): Fr {
  const inputFields = serializeToFields(input);
  const response = BarretenbergSync.getSingleton().pedersenHash({
    inputs: inputFields.map(i => i.toBuffer()),
    hashIndex: index,
  });
  return Fr.fromBuffer(Buffer.from(response.hash));
}

/**
 * Create a pedersen hash from an arbitrary length buffer.
 */
export function pedersenHashBuffer(input: Buffer, index = 0) {
  const response = BarretenbergSync.getSingleton().pedersenHashBuffer({
    input,
    hashIndex: index,
  });
  return Buffer.from(response.hash);
}
