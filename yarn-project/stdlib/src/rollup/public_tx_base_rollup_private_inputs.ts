import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { ProofData, ProofDataForFixedVk, type RollupHonkProofData } from '../proofs/proof_data.js';
import type { AvmProofData } from './avm_proof_data.js';
import { PublicBaseRollupHints } from './base_rollup_hints.js';
import { PublicChonkVerifierPublicInputs } from './public_chonk_verifier_public_inputs.js';

export class PublicTxBaseRollupPrivateInputs {
  constructor(
    public publicChonkVerifierProofData: RollupHonkProofData<PublicChonkVerifierPublicInputs>,
    public avmProofData: AvmProofData,
    public hints: PublicBaseRollupHints,
  ) {}

  static from(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>): PublicTxBaseRollupPrivateInputs {
    return new PublicTxBaseRollupPrivateInputs(...PublicTxBaseRollupPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicTxBaseRollupPrivateInputs>) {
    return [fields.publicChonkVerifierProofData, fields.avmProofData, fields.hints] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader): PublicTxBaseRollupPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicTxBaseRollupPrivateInputs(
      ProofData.fromBuffer(reader, PublicChonkVerifierPublicInputs),
      ProofDataForFixedVk.fromBuffer(reader, AvmCircuitPublicInputs),
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
