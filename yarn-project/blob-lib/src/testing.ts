import { makeTuple } from '@aztec/foundation/array';
import { BLS12Fq, BLS12Fr, BLS12Point, BLSPointNotOnCurveError } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';

import { Blob } from './blob.js';
import { BlobAccumulator } from './circuit_types/blob_accumulator.js';
import { FinalBlobAccumulator } from './circuit_types/final_blob_accumulator.js';
import { FinalBlobBatchingChallenges } from './circuit_types/final_blob_batching_challenges.js';
import { Poseidon2Sponge, SpongeBlob } from './sponge_blob.js';

export * from './encoding/fixtures.js';

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
  );
}

/**
 * Makes an arbitrary but valid BLS12 point. The value is deterministic for a given seed.
 * @param seed - The seed to use for generating the point.
 * @returns A BLS12 point instance.
 */
function makeBLS12Point(seed = 1): BLS12Point {
  let accum = 0;
  while (true) {
    try {
      const x = new BLS12Fq(seed + accum);
      const y = BLS12Point.YFromX(x);
      if (y) {
        return new BLS12Point(x, y, false);
      }
      accum++;
    } catch (e: any) {
      if (!(e instanceof BLSPointNotOnCurveError)) {
        throw e;
      }
      // The point is not on the curve - try again
    }
  }
}

/**
 * Makes arbitrary blob public accumulator.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob accumulator.
 * @returns A blob accumulator instance.
 */
export function makeBlobAccumulator(seed = 1): BlobAccumulator {
  return new BlobAccumulator(
    new Fr(seed),
    new Fr(seed + 0x10),
    new BLS12Fr(seed + 0x20),
    makeBLS12Point(seed + 0x30),
    new Fr(seed + 0x50),
    new BLS12Fr(seed + 0x60),
  );
}

export function makeFinalBlobAccumulator(seed = 1) {
  return new FinalBlobAccumulator(
    new Fr(seed),
    new Fr(seed + 0x10),
    new BLS12Fr(seed + 0x20),
    makeBLS12Point(seed + 0x30),
  );
}

export function makeFinalBlobBatchingChallenges(seed = 1) {
  return new FinalBlobBatchingChallenges(new Fr(seed), new BLS12Fr(seed + 0x10));
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
