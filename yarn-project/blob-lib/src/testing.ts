import { FIELDS_PER_BLOB } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { randomInt } from '@aztec/foundation/crypto';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { BatchedBlobAccumulator } from './blob_batching.js';
import { getBlobsPerL1Block } from './blob_utils.js';
import { FinalBlobBatchingChallenges } from './circuit_types/index.js';
import { createBlockEndMarker, encodeTxStartMarker } from './encoding.js';
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

export function makeEncodedTxBlobFields(length: number): Fr[] {
  const txStartMarker = {
    numBlobFields: length,
    // The rest of the values don't matter. The test components using it do not try to deserialize everything.
    // Only `checkBlobFieldsEncoding` is used and it only looks at `numBlobFields`. This might change in the future
    // when we add more thorough checks to `checkBlobFieldsEncoding`.
    revertCode: 0,
    numNoteHashes: 0,
    numNullifiers: 0,
    numL2ToL1Msgs: 0,
    numPublicDataWrites: 0,
    numPrivateLogs: 0,
    publicLogsLength: 0,
    contractClassLogLength: 0,
  };

  return [
    encodeTxStartMarker(txStartMarker),
    ...Array.from({ length: length - 1 }, () => new Fr(randomInt(Number.MAX_SAFE_INTEGER))), // -1 to account for the tx start marker.
  ];
}

export function makeEncodedBlockBlobFields(...lengths: number[]): Fr[] {
  return [
    ...(lengths.length > 0 ? makeEncodedTxBlobFields(lengths[0] - 1) : []), // -1 to account for the block end marker.
    ...lengths.slice(1).flatMap(length => makeEncodedTxBlobFields(length)),
    createBlockEndMarker(lengths.length),
  ];
}

// Create blob fields for a checkpoint with a single block.
export function makeEncodedBlobFields(length: number): Fr[] {
  if (length <= 2) {
    throw new Error('Encoded blob fields length must be greater than 2');
  }

  const checkpointPrefix = new Fr(length);
  return [checkpointPrefix, ...makeEncodedBlockBlobFields(length - 1)]; // -1 to account for the checkpoint prefix.
}

/**
 * Make an encoded blob with the given length
 *
 * This will deserialise correctly in the archiver
 * @param length
 * @returns
 */
export function makeEncodedBlob(length: number): Blob {
  if (length > FIELDS_PER_BLOB) {
    throw new Error(`A single encoded blob must be less than ${FIELDS_PER_BLOB} fields`);
  }

  return Blob.fromFields(makeEncodedBlobFields(length));
}

export function makeEncodedBlobs(length: number): Blob[] {
  const fields = makeEncodedBlobFields(length);
  return getBlobsPerL1Block(fields);
}

/**
 * Make a blob with random fields.
 *
 * This will fail deserialisation in the archiver
 * @param length
 * @returns
 */
export function makeRandomBlob(length: number): Blob {
  return Blob.fromFields([...Array.from({ length: length }, () => Fr.random())]);
}
