import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { VkData } from '../vks/index.js';
import { PrivateToPublicKernelCircuitPublicInputs } from './private_to_public_kernel_circuit_public_inputs.js';
import { PrivateToRollupKernelCircuitPublicInputs } from './private_to_rollup_kernel_circuit_public_inputs.js';

export class HidingKernelToRollupPrivateInputs {
  constructor(
    public previousKernelPublicInputs: PrivateToRollupKernelCircuitPublicInputs,
    public previousKernelVkData: VkData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernelPublicInputs, this.previousKernelVkData);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(reader.readObject(PrivateToRollupKernelCircuitPublicInputs), reader.readObject(VkData));
  }
}

export class HidingKernelToPublicPrivateInputs {
  constructor(
    public previousKernelPublicInputs: PrivateToPublicKernelCircuitPublicInputs,
    public previousKernelVkData: VkData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernelPublicInputs, this.previousKernelVkData);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(reader.readObject(PrivateToPublicKernelCircuitPublicInputs), reader.readObject(VkData));
  }
}
