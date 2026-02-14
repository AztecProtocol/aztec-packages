import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * See `noir-projects/noir-protocol-circuits/crates/blob/src/abis/final_blob_batching_challenges.nr` for documentation.
 */
export class FinalBlobBatchingChallenges {
  constructor(
    public readonly z: Fr,
    public readonly gamma: Fr,
  ) {}

  equals(other: FinalBlobBatchingChallenges) {
    return this.z.equals(other.z) && this.gamma.equals(other.gamma);
  }

  static empty(): FinalBlobBatchingChallenges {
    return new FinalBlobBatchingChallenges(Fr.ZERO, Fr.ZERO);
  }

  static fromBuffer(buffer: Buffer | BufferReader): FinalBlobBatchingChallenges {
    const reader = BufferReader.asReader(buffer);
    return new FinalBlobBatchingChallenges(Fr.fromBuffer(reader), Fr.fromBuffer(reader));
  }

  toBuffer() {
    return serializeToBuffer(this.z, this.gamma);
  }
}
