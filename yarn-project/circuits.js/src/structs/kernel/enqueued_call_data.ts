import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Proof } from '../proof.js';
import { VMCircuitPublicInputs } from './vm_circuit_public_inputs.js';

/**
 * Public calldata assembled from the kernel execution result and proof.
 */
export class EnqueuedCallData {
  constructor(public readonly data: VMCircuitPublicInputs, public readonly proof: Proof) {}

  toBuffer() {
    return serializeToBuffer(this.data, this.proof);
  }

  static fromBuffer(buffer: BufferReader | Buffer) {
    const reader = BufferReader.asReader(buffer);
    return new EnqueuedCallData(reader.readObject(VMCircuitPublicInputs), reader.readObject(Proof));
  }
}
