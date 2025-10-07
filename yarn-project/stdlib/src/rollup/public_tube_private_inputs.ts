import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';
import { type CivcProofData, ProofData } from '../proofs/proof_data.js';

export class PublicTubePrivateInputs {
  constructor(
    public hidingKernelProofData: CivcProofData<PrivateToPublicKernelCircuitPublicInputs>,
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<PublicTubePrivateInputs>) {
    return new PublicTubePrivateInputs(...PublicTubePrivateInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicTubePrivateInputs>) {
    return [fields.hidingKernelProofData, fields.proverId] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicTubePrivateInputs(
      ProofData.fromBuffer(reader, PrivateToPublicKernelCircuitPublicInputs),
      Fr.fromBuffer(reader),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicTubePrivateInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicTubePrivateInputs.fromBuffer(hexToBuffer(str));
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
    return bufferSchemaFor(PublicTubePrivateInputs);
  }
}
