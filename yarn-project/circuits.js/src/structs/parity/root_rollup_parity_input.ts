import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { RECURSIVE_PROOF_LENGTH } from '../../constants.gen.js';
import { RecursiveProof } from '../recursive_proof.js';
import { VerificationKey } from '../verification_key.js';
import { ParityPublicInputs } from './parity_public_inputs.js';

export class RootParityInput {
  constructor(
    /** The proof of the execution of the parity circuit. */
    public readonly proof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>,
    /** The verification key of the root parity circuit */
    public readonly verificationKey: VerificationKey,
    /** The public inputs of the parity circuit. */
    public readonly publicInputs: ParityPublicInputs,
  ) {}

  toBuffer() {
    return serializeToBuffer(...RootParityInput.getFields(this));
  }

  static from(fields: FieldsOf<RootParityInput>): RootParityInput {
    return new RootParityInput(...RootParityInput.getFields(fields));
  }

  static getFields(fields: FieldsOf<RootParityInput>) {
    return [fields.proof, fields.verificationKey, fields.publicInputs] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new RootParityInput(
      RecursiveProof.fromBuffer(reader, RECURSIVE_PROOF_LENGTH),
      VerificationKey.fromBuffer(reader),
      reader.readObject(ParityPublicInputs),
    );
  }
}
