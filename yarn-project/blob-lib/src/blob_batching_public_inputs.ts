import { BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Blob } from './blob.js';
import { BatchedBlob, BatchedBlobAccumulator, FinalBlobBatchingChallenges } from './blob_batching.js';

/**
 * See nr BlobAccumulatorPublicInputs and ts BatchedBlobAccumulator for documentation.
 */
export class BlobAccumulatorPublicInputs {
  constructor(
    public blobCommitmentsHash: Fr,
    public z: Fr,
    public y: BLS12Fr,
    public c: BLS12Point,
    public gamma: Fr,
    public gammaPow: BLS12Fr,
  ) {}

  static empty(): BlobAccumulatorPublicInputs {
    return new BlobAccumulatorPublicInputs(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO, Fr.ZERO, BLS12Fr.ZERO);
  }

  equals(other: BlobAccumulatorPublicInputs) {
    return (
      this.blobCommitmentsHash.equals(other.blobCommitmentsHash) &&
      this.z.equals(other.z) &&
      this.y.equals(other.y) &&
      this.c.equals(other.c) &&
      this.gamma.equals(other.gamma) &&
      this.gammaPow.equals(other.gammaPow)
    );
  }

  // isEmpty(): boolean {
  //   return this.v.isZero() && this.z.isZero() && this.y.isZero() && this.c.isZero() && this.gamma.isZero() && this.gammaPow.isZero();
  // }

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
    return serializeToBuffer(this.blobCommitmentsHash, this.z, this.y, this.c, this.gamma, this.gammaPow);
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
      this.blobCommitmentsHash,
      this.z,
      this.y,
      this.c,
      BLS12Point.ZERO,
      this.gamma,
      this.gammaPow,
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
      this.blobCommitmentsHash,
      this.z,
      ...this.y.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.c.x.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.c.y.toNoirBigNum().limbs.map(Fr.fromString),
      this.gamma,
      ...this.gammaPow.toNoirBigNum().limbs.map(Fr.fromString),
    ];
  }
}

/**
 * See nr FinalBlobAccumulatorPublicInputs and ts BatchedBlobAccumulator for documentation.
 */
export class FinalBlobAccumulatorPublicInputs {
  constructor(public blobCommitmentsHash: Fr, public z: Fr, public y: BLS12Fr, public c: BLS12Point) {}

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

  /** Creates a random instance. Used for testing only - will not prove/verify. */
  static random() {
    return new FinalBlobAccumulatorPublicInputs(Fr.random(), Fr.random(), BLS12Fr.random(), BLS12Point.random());
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

  // static fromFields(fields: Fr[] | FieldReader): BlockBlobPublicInputs {
  //   const reader = FieldReader.asReader(fields);
  //   return new BlockBlobPublicInputs(reader.readArray(BLOBS_PER_BLOCK, BlobPublicInputs));
  // }

  // toFields() {
  //   return this.inner.map(i => i.toFields()).flat();
  // }

  // static getFields(fields: FieldsOf<BlockBlobPublicInputs>) {
  //   return [fields.inner] as const;
  // }

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

  // // The below is used to send to L1 for proof verification
  // toString() {
  //   const nonEmptyBlobs = this.inner.filter(item => !item.isEmpty());
  //   // Write the number of blobs for L1 to verify
  //   let buf = Buffer.alloc(1);
  //   buf.writeUInt8(nonEmptyBlobs.length);
  //   // Using standard toBuffer() does not correctly encode the commitment
  //   // On L1, it's a 48 byte number, which we convert to 2 fields for use in the circuits
  //   nonEmptyBlobs.forEach(blob => {
  //     buf = Buffer.concat([buf, blob.z.toBuffer(), toBufferBE(blob.y, 32), blob.commitmentToBuffer()]);
  //   });
  //   return buf.toString('hex');
  // }
}
