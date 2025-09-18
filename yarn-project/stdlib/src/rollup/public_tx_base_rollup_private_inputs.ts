import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';
import { ProofData, type RollupHonkProofData } from '../proofs/proof_data.js';
import { AvmProofData } from './avm_proof_data.js';
import { PublicBaseRollupHints } from './base_rollup_hints.js';

export class PublicTxBaseRollupPrivateInputs {
  constructor(
    public publicTubeProofData: RollupHonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    public avmProofData: AvmProofData,
    public hints: PublicBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>): PublicTxBaseRollupPrivateInputs {
    return new PublicTxBaseRollupPrivateInputs(...PublicTxBaseRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>) {
    return [fields.publicTubeProofData, fields.avmProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicTxBaseRollupPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicTxBaseRollupPrivateInputs(
      ProofData.fromBuffer(reader, PrivateToPublicKernelCircuitPublicInputs),
      reader.readObject(AvmProofData),
      reader.readObject(PublicBaseRollupHints),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicTxBaseRollupPrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicTxBaseRollupPrivateInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  /** Returns a representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a string. */
  static get schema() {
    return bufferSchemaFor(PublicTxBaseRollupPrivateInputs);
  }
}
