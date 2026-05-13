import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PrivateCallData } from './private_call_data.js';
import { PrivateKernelData } from './private_kernel_data.js';

/**
 * Input to the batched private kernel inner circuit, which processes two app calls in a single
 * iteration following a previous kernel.
 */
export class PrivateKernelInner2CircuitPrivateInputs {
  constructor(
    public previousKernel: PrivateKernelData,
    public privateCall0: PrivateCallData,
    public privateCall1: PrivateCallData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.privateCall0, this.privateCall1);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInner2CircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInner2CircuitPrivateInputs(
      reader.readObject(PrivateKernelData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
    );
  }
}
