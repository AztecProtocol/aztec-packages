import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PrivateCallData } from './private_call_data.js';
import { PrivateKernelData } from './private_kernel_data.js';

/**
 * Input to the batched private kernel inner circuit, which processes four app calls in a single
 * iteration following a previous kernel.
 */
export class PrivateKernelInner4CircuitPrivateInputs {
  constructor(
    public previousKernel: PrivateKernelData,
    public privateCall0: PrivateCallData,
    public privateCall1: PrivateCallData,
    public privateCall2: PrivateCallData,
    public privateCall3: PrivateCallData,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.previousKernel,
      this.privateCall0,
      this.privateCall1,
      this.privateCall2,
      this.privateCall3,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelInner4CircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelInner4CircuitPrivateInputs(
      reader.readObject(PrivateKernelData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
      reader.readObject(PrivateCallData),
    );
  }
}
