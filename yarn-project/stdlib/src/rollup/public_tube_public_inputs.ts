import { Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { PrivateToPublicKernelCircuitPublicInputs } from '../kernel/private_to_public_kernel_circuit_public_inputs.js';

export class PublicTubePublicInputs {
  constructor(
    public privateTail: PrivateToPublicKernelCircuitPublicInputs,
    public proverId: Fr,
  ) {}

  static from(fields: FieldsOf<PublicTubePublicInputs>) {
    return new PublicTubePublicInputs(...PublicTubePublicInputs.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicTubePublicInputs>) {
    return [fields.privateTail, fields.proverId] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicTubePublicInputs(
      reader.readObject(PrivateToPublicKernelCircuitPublicInputs),
      reader.readObject(Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicTubePublicInputs.getFields(this));
  }

  static fromString(str: string) {
    return PublicTubePublicInputs.fromBuffer(hexToBuffer(str));
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
    return bufferSchemaFor(PublicTubePublicInputs);
  }
}
