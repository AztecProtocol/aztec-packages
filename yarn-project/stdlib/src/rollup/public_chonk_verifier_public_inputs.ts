import { Fr } from '@aztec/foundation/curves/bn254';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';

// CHONK_VERIFIER: Recursively verifies Chonk (Client Honk) proofs in circuits
export class PublicChonkVerifierPublicInputs {
  constructor(
    public privateTail: PrivateToPublicKernelCircuitPublicInputs,
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<PublicChonkVerifierPublicInputs>) {
    return new PublicChonkVerifierPublicInputs(...PublicChonkVerifierPublicInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicChonkVerifierPublicInputs>) {
    return [fields.privateTail, fields.proverId] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicChonkVerifierPublicInputs(
      reader.readObject(PrivateToPublicKernelCircuitPublicInputs),
      reader.readObject(Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicChonkVerifierPublicInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicChonkVerifierPublicInputs.fromBuffer(hexToBuffer(str));
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
    return bufferSchemaFor(PublicChonkVerifierPublicInputs);
  }
}
