import { BLS12Fr, BLS12Point } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { FinalBlobAccumulator } from './circuit_types/index.js';

/**
 * A class to represent the result from accumulating blobs in an epoch using BatchedBlobAccumulator.
 */
export class BatchedBlob {
  constructor(
    /** Hash of Cs (to link to L1 blob hashes). */
    public readonly blobCommitmentsHash: Fr,
    /** Challenge point z such that p_i(z) = y_i. */
    public readonly z: Fr,
    /** Evaluation y, linear combination of all evaluations y_i = p_i(z) with gamma. */
    public readonly y: BLS12Fr,
    /** Commitment C, linear combination of all commitments C_i = [p_i] with gamma. */
    public readonly commitment: BLS12Point,
    /** KZG opening 'proof' Q (commitment to the quotient poly.), linear combination of all blob kzg 'proofs' Q_i with gamma. */
    public readonly q: BLS12Point,
  ) {}

  toFinalBlobAccumulator() {
    return new FinalBlobAccumulator(this.blobCommitmentsHash, this.z, this.y, this.commitment);
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.blobCommitmentsHash, this.z, this.y, this.commitment, this.q);
  }

  static fromBuffer(buffer: Buffer | BufferReader): BatchedBlob {
    const reader = BufferReader.asReader(buffer);
    return new BatchedBlob(
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      BLS12Fr.fromBuffer(reader),
      BLS12Point.fromBuffer(reader),
      BLS12Point.fromBuffer(reader),
    );
  }

  toString(): string {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string): BatchedBlob {
    return BatchedBlob.fromBuffer(hexToBuffer(str));
  }
}
