import { BLS12_FQ_LIMBS, BLS12_FR_LIMBS } from '@aztec/constants';
import { BLS12Fq, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { Blob } from './blob.js';
import { BatchedBlob, BatchedBlobAccumulator, FinalBlobBatchingChallenges } from './blob_batching.js';

/**
 * See nr BlobAccumulator and ts BatchedBlobAccumulator for documentation.
 */
export class BlobAccumulator {
  constructor(
    public blobCommitmentsHashAcc: Fr,
    public zAcc: Fr,
    public yAcc: BLS12Fr,
    public cAcc: BLS12Point,
    public gammaAcc: Fr,
    public gammaPowAcc: BLS12Fr,
  ) {}

  static empty(): BlobAccumulator {
    return new BlobAccumulator(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO, Fr.ZERO, BLS12Fr.ZERO);
  }

  equals(other: BlobAccumulator) {
    return (
      this.blobCommitmentsHashAcc.equals(other.blobCommitmentsHashAcc) &&
      this.zAcc.equals(other.zAcc) &&
      this.yAcc.equals(other.yAcc) &&
      this.cAcc.equals(other.cAcc) &&
      this.gammaAcc.equals(other.gammaAcc) &&
      this.gammaPowAcc.equals(other.gammaPowAcc)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): BlobAccumulator {
    const reader = BufferReader.asReader(buffer);
    return new BlobAccumulator(
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
    return new BlobAccumulator(acc.blobCommitmentsHashAcc, acc.zAcc, acc.yAcc, acc.cAcc, acc.gammaAcc, acc.gammaPow);
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

  static fromFields(fields: Fr[] | FieldReader): BlobAccumulator {
    const reader = FieldReader.asReader(fields);
    return new BlobAccumulator(
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

  /**
   * Converts from an accumulator to a struct for the public inputs of our rollup circuits.
   * @returns A BlobAccumulator instance.
   */
  static fromBatchedBlobAccumulator(accumulator: BatchedBlobAccumulator) {
    return new BlobAccumulator(
      accumulator.blobCommitmentsHashAcc,
      accumulator.zAcc,
      accumulator.yAcc,
      accumulator.cAcc,
      accumulator.gammaAcc,
      accumulator.gammaPow,
    );
  }
}

/**
 * See nr FinalBlobAccumulator and ts BatchedBlobAccumulator for documentation.
 */
export class FinalBlobAccumulator {
  constructor(
    public blobCommitmentsHash: Fr,
    public z: Fr,
    public y: BLS12Fr,
    public c: BLS12Point,
  ) {}

  static empty(): FinalBlobAccumulator {
    return new FinalBlobAccumulator(Fr.ZERO, Fr.ZERO, BLS12Fr.ZERO, BLS12Point.ZERO);
  }

  static fromBuffer(buffer: Buffer | BufferReader): FinalBlobAccumulator {
    const reader = BufferReader.asReader(buffer);
    return new FinalBlobAccumulator(
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
    return new FinalBlobAccumulator(blob.blobCommitmentsHash, blob.z, blob.y, blob.commitment);
  }

  toFields() {
    return [
      this.blobCommitmentsHash,
      this.z,
      ...this.y.toNoirBigNum().limbs.map(Fr.fromString),
      ...this.c.toBN254Fields(),
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

  equals(other: FinalBlobAccumulator) {
    return (
      this.blobCommitmentsHash.equals(other.blobCommitmentsHash) &&
      this.z.equals(other.z) &&
      this.y.equals(other.y) &&
      this.c.equals(other.c)
    );
  }

  // Creates a random instance. Used for testing only - will not prove/verify.
  static random() {
    return new FinalBlobAccumulator(Fr.random(), Fr.random(), BLS12Fr.random(), BLS12Point.random());
  }

  // Warning: MUST be final accumulator state.
  static fromBatchedBlobAccumulator(accumulator: BatchedBlobAccumulator) {
    return new FinalBlobAccumulator(
      accumulator.blobCommitmentsHashAcc,
      accumulator.zAcc,
      accumulator.yAcc,
      accumulator.cAcc,
    );
  }

  [inspect.custom]() {
    return `FinalBlobAccumulator {
      blobCommitmentsHash: ${inspect(this.blobCommitmentsHash)},
      z: ${inspect(this.z)},
      y: ${inspect(this.y)},
      c: ${inspect(this.c)},
    }`;
  }
}
