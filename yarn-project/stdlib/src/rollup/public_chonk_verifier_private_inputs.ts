import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';
import { type ChonkProofData, ProofData } from '../proofs/proof_data.js';

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
export class PublicChonkVerifierPrivateInputs {
  constructor(
    public hidingKernelProofData: ChonkProofData<PrivateToPublicKernelCircuitPublicInputs>,
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<PublicChonkVerifierPrivateInputs>) {
    return new PublicChonkVerifierPrivateInputs(...PublicChonkVerifierPrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicChonkVerifierPrivateInputs>) {
    return [fields.hidingKernelProofData, fields.proverId] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicChonkVerifierPrivateInputs(
      ProofData.fromBuffer(reader, PrivateToPublicKernelCircuitPublicInputs),
      Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicChonkVerifierPrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicChonkVerifierPrivateInputs.fromBuffer(hexToBuffer(str));
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
    return bufferSchemaFor(PublicChonkVerifierPrivateInputs);
  }
}
