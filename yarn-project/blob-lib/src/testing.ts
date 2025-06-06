import { makeTuple } from '@aztec/foundation/array';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { BatchedBlobAccumulator, FinalBlobBatchingChallenges } from './blob_batching.js';
import { BlockBlobPublicInputs } from './blob_batching_public_inputs.js';
import { TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH } from './encoding.js';
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
 * Makes arbitrary block blob public inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob inputs.
 * @returns A block blob public inputs instance.
 */
export function makeBlockBlobPublicInputs(seed = 1): BlockBlobPublicInputs {
  const startBlobAccumulator = makeBatchedBlobAccumulator(seed);
  return new BlockBlobPublicInputs(
    startBlobAccumulator.toBlobAccumulatorPublicInputs(),
    makeBatchedBlobAccumulator(seed + 1).toBlobAccumulatorPublicInputs(),
    startBlobAccumulator.finalBlobChallenges,
  );
}

// TODO: copied form stdlib tx effect
function encodeFirstField(length: number): Fr {
  const lengthBuf = Buffer.alloc(2);
  lengthBuf.writeUInt16BE(length, 0);
  return new Fr(
    Buffer.concat([
      toBufferBE(TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH),
      Buffer.alloc(1),
      lengthBuf,
      Buffer.alloc(1),
      Buffer.from([1]),
      Buffer.alloc(1),
      Buffer.alloc(1),
    ]),
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
  return Blob.fromFields([encodeFirstField(length + 1), ...Array.from({ length: length }, () => Fr.random())]);
}

/**
 * Make an unencoded blob with the given length
 *
 * This will fail deserialisation in the archiver
 * @param length
 * @returns
 */
export function makeUnencodedBlob(length: number): Promise<Blob> {
  return Blob.fromFields([...Array.from({ length: length }, () => Fr.random())]);
}

export function makeEncodedBlobFields(fields: Fr[]): Promise<Blob> {
  return Blob.fromFields([encodeFirstField(fields.length + 1), ...fields]);
}
