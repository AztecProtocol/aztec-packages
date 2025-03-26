import { GeneratorIndex } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import type { AztecAddress } from '../aztec-address/index.js';
import { hexSchemaFor } from '../schemas/schemas.js';
import { Vector } from '../types/shared.js';

/**
 * An authentication witness. Used to authorize an action by a user.
 */
export class AuthWitness {
  /** Authentication witness for the hash  */
  public readonly witness: Fr[];

  constructor(
    /** Hash of the request to authorize */
    public readonly requestHash: Fr,
    /** Authentication witness for the hash  */
    witness: (Fr | number)[],
  ) {
    this.witness = witness.map(x => new Fr(x));
  }

  static get schema() {
    return hexSchemaFor(AuthWitness);
  }

  toJSON() {
    return this.toString();
  }

  toBuffer() {
    return serializeToBuffer(this.requestHash, new Vector(this.witness));
  }

  static fromBuffer(buffer: Buffer | BufferReader): AuthWitness {
    const reader = BufferReader.asReader(buffer);
    return new AuthWitness(Fr.fromBuffer(reader), reader.readVector(Fr));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return AuthWitness.fromBuffer(hexToBuffer(str));
  }

  static random() {
    return new AuthWitness(Fr.random(), [Fr.random(), Fr.random(), Fr.random()]);
  }
}

/**
 * Compute the inner hash for an authentication witness.
 * This is the "intent" of the message, before siloed with the consumer.
 * @param args - The arguments to hash
 * @returns The inner hash for the witness
 */
export const computeInnerAuthWitHash = (args: Fr[]) => {
  return poseidon2HashWithSeparator(args, GeneratorIndex.AUTHWIT_INNER);
};

/**
 * Compute the outer hash for an authentication witness.
 * This is the value siloed with its "consumer" and what the `on_behalf_of`
 * should be signing.
 * The consumer is who will be consuming the message, for token approvals it
 * is the token contract itself (because the token makes the call to check the approval).
 * @param consumer - The address that can "consume" the authwit
 * @param chainId - The chain id that can "consume" the authwit
 * @param version - The version that can "consume" the authwit
 * @param innerHash - The inner hash for the witness
 * @returns The outer hash for the witness
 */
export const computeOuterAuthWitHash = (consumer: AztecAddress, chainId: Fr, version: Fr, innerHash: Fr) => {
  return poseidon2HashWithSeparator([consumer.toField(), chainId, version, innerHash], GeneratorIndex.AUTHWIT_OUTER);
};
