import { BLS12_FQ_LIMBS, BLS12_FR_LIMBS } from '@aztec/constants';
import { BLS12Fq, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { Blob } from './blob.js';
import { BatchedBlob, BatchedBlobAccumulator, FinalBlobBatchingChallenges } from './blob_batching.js';

/**
 * See nr BlobAccumulatorPublicInputs and ts BatchedBlobAccumulator for documentation.
 */
export class BlobAccumulatorPublicInputs {
  constructor(
    public blobCommitmentsHashAcc: Fr,
    public zAcc: Fr,
    public yAcc: BLS12Fr,
    public cAcc: BLS12Point,
    public gammaAcc: Fr,
    public gammaPowAcc: BLS12Fr,
  ) {}

  static empty(): BlobAccumulatorPublicInputs {
    return new BlobAccumulatorPublicInputs(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO, Fr.ZERO, BLS12Fr.ZERO);
  }

  equals(other: BlobAccumulatorPublicInputs) {
    return (
      this.blobCommitmentsHashAcc.equals(other.blobCommitmentsHashAcc) &&
      this.zAcc.equals(other.zAcc) &&
      this.yAcc.equals(other.yAcc) &&
      this.cAcc.equals(other.cAcc) &&
      this.gammaAcc.equals(other.gammaAcc) &&
      this.gammaPowAcc.equals(other.gammaPowAcc)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlobAccumulatorPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlobAccumulatorPublicInputs(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
      BLS12Point.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.blobCommitmentsHashAcc,
      this.zAcc,
      this.yAcc,
      this.cAcc,
      this.gammaAcc,
      this.gammaPowAcc,
    );
  }

  /**
   * Given blobs, accumulate all public inputs state.
   * We assume the input blobs have not been evaluated at z.
   * NOTE: Does NOT accumulate non circuit values including Q. This exists to simulate/check exactly what the circuit is doing
   * and is unsafe for other use. For that reason, a toBatchedBlobAccumulator does not exist. See evaluateBlobs() oracle for usage.
   * @returns An updated blob accumulator.
   */
  async accumulateBlobs(blobs: Blob[], finalBlobChallenges: FinalBlobBatchingChallenges) {
    let acc = new BatchedBlobAccumulator(
      this.blobCommitmentsHashAcc,
      this.zAcc,
      this.yAcc,
      this.cAcc,
      BLS12Point.ZERO,
      this.gammaAcc,
      this.gammaPowAcc,
      finalBlobChallenges,
    );
    acc = await acc.accumulateBlobs(blobs);
    return new BlobAccumulatorPublicInputs(
      acc.blobCommitmentsHashAcc,
      acc.zAcc,
      acc.yAcc,
      acc.cAcc,
      acc.gammaAcc,
      acc.gammaPow,
    );
  }

  toFields() {
    return [
      this.blobCommitmentsHashAcc,
      this.zAcc,
      ...this.yAcc.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.cAcc.x.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.cAcc.y.toNoirBigNum().limbs.map(Fr.fromString),
      new Fr(this.cAcc.isInfinite),
      this.gammaAcc,
      ...this.gammaPowAcc.toNoirBigNum().limbs.map(Fr.fromString),
    ];
  }

  static fromFields(fields: Fr[] | FieldReader): BlobAccumulatorPublicInputs {
    const reader = FieldReader.asReader(fields);
    return new BlobAccumulatorPublicInputs(
      reader.readField(),
      reader.readField(),
      BLS12Fr.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FR_LIMBS).map(f => f.toString()) }),
      new BLS12Point(
        BLS12Fq.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FQ_LIMBS).map(f => f.toString()) }),
        BLS12Fq.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FQ_LIMBS).map(f => f.toString()) }),
        reader.readBoolean(),
      ),
      reader.readField(),
      BLS12Fr.fromNoirBigNum({ limbs: reader.readFieldArray(BLS12_FR_LIMBS).map(f => f.toString()) }),
    );
  }
}

/**
 * See nr FinalBlobAccumulatorPublicInputs and ts BatchedBlobAccumulator for documentation.
 */
export class FinalBlobAccumulatorPublicInputs {
  constructor(
    public blobCommitmentsHash: Fr,
    public z: Fr,
    public y: BLS12Fr,
    public c: BLS12Point,
  ) {}

  static empty(): FinalBlobAccumulatorPublicInputs {
    return new FinalBlobAccumulatorPublicInputs(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO);
  }

  static fromBuffer(buffer: Buffer | BufferReader): FinalBlobAccumulatorPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new FinalBlobAccumulatorPublicInputs(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
      BLS12Point.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.blobCommitmentsHash, this.z, this.y, this.c);
  }

  static fromBatchedBlob(blob: BatchedBlob) {
    return new FinalBlobAccumulatorPublicInputs(blob.blobCommitmentsHash, blob.z, blob.y, blob.commitment);
  }

  toFields() {
    return [
      this.blobCommitmentsHash,
      this.z,
      ...this.y.toNoirBigNum().limbs.map(Fr.fromString),
      // TODO(MW): add conversion when public inputs finalised
      ...[new Fr(this.c.compress().subarray(0, 31)), new Fr(this.c.compress().subarray(31, 48))],
    ];
  }

  // The below is used to send to L1 for proof verification
  toString() {
    // We prepend 32 bytes for the (unused) 'blobHash' slot. This is not read or required by getEpochProofPublicInputs() on L1, but
    // is expected since we usually pass the full precompile inputs via verifyEpochRootProof() to getEpochProofPublicInputs() to ensure
    // we use calldata rather than a slice in memory:
    const buf = Buffer.concat([Buffer.alloc(32), this.z.toBuffer(), this.y.toBuffer(), this.c.compress()]);
    return buf.toString('hex');
  }

  equals(other: FinalBlobAccumulatorPublicInputs) {
    return (
      this.blobCommitmentsHash.equals(other.blobCommitmentsHash) &&
      this.z.equals(other.z) &&
      this.y.equals(other.y) &&
      this.c.equals(other.c)
    );
  }

  // Creates a random instance. Used for testing only - will not prove/verify.
  static random() {
    return new FinalBlobAccumulatorPublicInputs(Fr.random(), Fr.random(), BLS12Fr.random(), BLS12Point.random());
  }

  [inspect.custom]() {
    return `FinalBlobAccumulatorPublicInputs {
      blobCommitmentsHash: ${inspect(this.blobCommitmentsHash)},
      z: ${inspect(this.z)},
      y: ${inspect(this.y)},
      c: ${inspect(this.c)},
    }`;
  }
}

/**
 * startBlobAccumulator: Accumulated opening proofs for all blobs before this block range.
 * endBlobAccumulator: Accumulated opening proofs for all blobs after adding this block range.
 * finalBlobChallenges:  Final values z and gamma, shared across the epoch.
 */
export class BlockBlobPublicInputs {
  constructor(
    public startBlobAccumulator: BlobAccumulatorPublicInputs,
    public endBlobAccumulator: BlobAccumulatorPublicInputs,
    public finalBlobChallenges: FinalBlobBatchingChallenges,
  ) {}

  static empty(): BlockBlobPublicInputs {
    return new BlockBlobPublicInputs(
      BlobAccumulatorPublicInputs.empty(),
      BlobAccumulatorPublicInputs.empty(),
      FinalBlobBatchingChallenges.empty(),
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlockBlobPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new BlockBlobPublicInputs(
      reader.readObject(BlobAccumulatorPublicInputs),
      reader.readObject(BlobAccumulatorPublicInputs),
      reader.readObject(FinalBlobBatchingChallenges),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.startBlobAccumulator, this.endBlobAccumulator, this.finalBlobChallenges);
  }

  // Creates BlockBlobPublicInputs from the starting accumulator state and all blobs in the block.
  // Assumes that startBlobAccumulator.finalChallenges have already been precomputed.
  // Does not finalise challenge values (this is done in the final root rollup).
  // TODO(MW): Integrate with BatchedBlob once old Blob classes removed
  static async fromBlobs(startBlobAccumulator: BatchedBlobAccumulator, blobs: Blob[]): Promise<BlockBlobPublicInputs> {
    const endBlobAccumulator = await startBlobAccumulator.accumulateBlobs(blobs);
    return new BlockBlobPublicInputs(
      startBlobAccumulator.toBlobAccumulatorPublicInputs(),
      endBlobAccumulator.toBlobAccumulatorPublicInputs(),
      startBlobAccumulator.finalBlobChallenges,
    );
  }
}
