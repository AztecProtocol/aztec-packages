import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToRollupKernelCircuitPublicInputs } from '../kernel/private_to_rollup_kernel_circuit_public_inputs.js';
import { type CivcProofData, ProofData } from '../proofs/proof_data.js';
import { PrivateBaseRollupHints } from './base_rollup_hints.js';

export class PrivateTxBaseRollupPrivateInputs {
  constructor(
    public hidingKernelProofData: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
    public hints: PrivateBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PrivateTxBaseRollupPrivateInputs>): PrivateTxBaseRollupPrivateInputs {
    return new PrivateTxBaseRollupPrivateInputs(...PrivateTxBaseRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateTxBaseRollupPrivateInputs>) {
    return [fields.hidingKernelProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateTxBaseRollupPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateTxBaseRollupPrivateInputs(
      ProofData.fromBuffer(reader, PrivateToRollupKernelCircuitPublicInputs),
      reader.readObject(PrivateBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateTxBaseRollupPrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PrivateTxBaseRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  /** Returns a buffer representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(PrivateTxBaseRollupPrivateInputs);
  }
}
