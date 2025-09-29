import { makeTuple } from '@aztec/foundation/array';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { BatchedBlobAccumulator, FinalBlobBatchingChallenges } from './blob_batching.js';
import { encodeTxStartMarker } from './encoding.js';
import { Poseidon2Sponge, SpongeBlob } from './sponge_blob.js';

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

/**
 * Makes arbitrary blob public accumulator.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob accumulator.
 * @returns A blob accumulator instance.
 */
export function makeBatchedBlobAccumulator(seed = 1): BatchedBlobAccumulator {
  return new BatchedBlobAccumulator(
    new Fr(seed),
    new Fr(seed + 1),
    new BLS12Fr(seed + 2),
    BLS12Point.random(),
    BLS12Point.random(),
    new Fr(seed + 3),
    new BLS12Fr(seed + 4),
    new FinalBlobBatchingChallenges(new Fr(seed + 5), new BLS12Fr(seed + 6)),
  );
}

/**
 * Make an encoded blob with the given length
 *
 * This will deserialise correctly in the archiver
 * @param length
 * @returns
 */
export function makeEncodedBlob(length: number): Promise<Blob> {
  const txStartMarker = {
    numBlobFields: length,
    // The rest of the values don't matter. The test components using it only look at `numBlobFields` to split the blobs
    // into fields for tx effects.
    revertCode: 0,
    numNoteHashes: 0,
    numNullifiers: 0,
    numL2ToL1Msgs: 0,
    numPublicDataWrites: 0,
    numPrivateLogs: 0,
    publicLogsLength: 0,
    contractClassLogLength: 0,
  };
  return Blob.fromFields([
    encodeTxStartMarker(txStartMarker),
    ...Array.from({ length: length - 1 }, () => Fr.random()),
  ]);
}

/**
 * Make a blob with random fields.
 *
 * This will fail deserialisation in the archiver
 * @param length
 * @returns
 */
export function makeRandomBlob(length: number): Promise<Blob> {
  return Blob.fromFields([...Array.from({ length: length }, () => Fr.random())]);
}
