/**
 * Pedersen hash and commitment operations - delegates to barretenberg/ts implementation.
 * This wrapper maintains the foundation API using Fieldable types.
 */
import {
  pedersenCommit as pedersenCommitImpl,
  pedersenHashBuffer as pedersenHashBufferImpl,
  pedersenHash as pedersenHashImpl,
} from '@aztec/bb.js/crypto/pedersen';
import { Bn254Fr } from '@aztec/bb.js/types/fields';

import { Fr } from '../../fields/fields.js';
import { type Fieldable, serializeToFields } from '../../serialize/serialize.js';

/**
 * Create a pedersen commitment (point) from an array of input fields.
 * Left pads any inputs less than 32 bytes.
 */
export async function pedersenCommit(input: Buffer[], offset = 0) {
  return await pedersenCommitImpl(input, offset);
}

/**
 * Create a pedersen hash (field) from an array of input fields.
 * @param input - The input fieldables to hash.
 * @param index - The separator index to use for the hash.
 * @returns The pedersen hash.
 */
export async function pedersenHash(input: Fieldable[], index = 0): Promise<Fr> {
  const inputFields = serializeToFields(input);
  const bn254Frs = inputFields.map(f => Bn254Fr.fromBuffer(f.toBuffer()));
  const result = await pedersenHashImpl(bn254Frs, index);
  return Fr.fromBuffer(Buffer.from(result.toBuffer()));
}

/**
 * Create a pedersen hash from an arbitrary length buffer.
 */
export async function pedersenHashBuffer(input: Buffer, index = 0) {
  return await pedersenHashBufferImpl(input, index);
}
