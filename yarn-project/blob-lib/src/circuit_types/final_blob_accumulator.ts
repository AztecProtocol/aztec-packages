import { BLS12Fr, BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

/**
 * See `noir-projects/noir-protocol-circuits/crates/blob/src/abis/final_blob_accumulator.nr` for documentation.
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

  [inspect.custom]() {
    return `FinalBlobAccumulator {
      blobCommitmentsHash: ${inspect(this.blobCommitmentsHash)},
      z: ${inspect(this.z)},
      y: ${inspect(this.y)},
      c: ${inspect(this.c)},
    }`;
  }
}
