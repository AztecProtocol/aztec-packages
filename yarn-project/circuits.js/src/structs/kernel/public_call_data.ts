import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Proof } from '../proof.js';
import { PublicCircuitPublicInputs } from '../public_circuit_public_inputs.js';

/**
 * Public calldata assembled from the kernel execution result and proof.
 */
export class PublicCallData {
  constructor(
    /**
     * Public inputs of the public function.
     */
    public publicInputs: PublicCircuitPublicInputs,
    /**
     * Proof of the call stack item execution.
     */
    public readonly proof: Proof,
    /**
     * Hash of the L2 contract bytecode.
     */
    public readonly bytecodeHash: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.proof, this.bytecodeHash);
  }

  static fromBuffer(buffer: BufferReader | Buffer) {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallData(
      reader.readObject(PublicCircuitPublicInputs),
      reader.readObject(Proof),
      reader.readObject(Fr),
    );
  }
}
