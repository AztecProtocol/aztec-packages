import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToRollupKernelCircuitPublicInputs } from '../kernel/private_to_rollup_kernel_circuit_public_inputs.js';
import { type CivcProofData, ProofData } from '../proofs/proof_data.js';
import { PrivateBaseRollupHints } from './base_rollup_hints.js';

export class PrivateBaseRollupInputs {
  constructor(
    public hidingKernelProofData: CivcProofData<PrivateToRollupKernelCircuitPublicInputs>,
    public hints: PrivateBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PrivateBaseRollupInputs>): PrivateBaseRollupInputs {
    return new PrivateBaseRollupInputs(...PrivateBaseRollupInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PrivateBaseRollupInputs>) {
    return [fields.hidingKernelProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateBaseRollupInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateBaseRollupInputs(
      ProofData.fromBuffer(reader, PrivateToRollupKernelCircuitPublicInputs),
      reader.readObject(PrivateBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PrivateBaseRollupInputs.getFields(this));
  }

  static fromString(str: string) {
    return PrivateBaseRollupInputs.fromBuffer(hexToBuffer(str));
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
    return bufferSchemaFor(PrivateBaseRollupInputs);
  }
}
