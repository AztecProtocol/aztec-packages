import { BLOBS_PER_BLOCK } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';

import { BlobPublicInputs, BlockBlobPublicInputs } from './blob_public_inputs.js';
import { Poseidon2Sponge, SpongeBlob } from './sponge_blob.js';

/**
 * Makes arbitrary blob public inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob inputs.
 * @returns A blob public inputs instance.
 */
export function makeBlobPublicInputs(seed = 1): BlobPublicInputs {
  return new BlobPublicInputs(
    new Fr(seed),
    BigInt(seed + 1),
    makeTuple(2, i => new Fr(i)),
  );
}

/**
 * Makes arbitrary block blob public inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob inputs.
 * @returns A block blob public inputs instance.
 */
export function makeBlockBlobPublicInputs(seed = 1): BlockBlobPublicInputs {
  return new BlockBlobPublicInputs(makeTuple(BLOBS_PER_BLOCK, () => makeBlobPublicInputs(seed)));
}

/**
 * Makes arbitrary poseidon sponge for blob inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the sponge.
 * @returns A sponge blob instance.
 */
export function makeSpongeBlob(seed = 1): SpongeBlob {
  return new SpongeBlob(
    new Poseidon2Sponge(
      makeTuple(3, i => new Fr(i)),
      makeTuple(4, i => new Fr(i)),
      1,
      false,
    ),
    seed,
    seed + 1,
  );
}
