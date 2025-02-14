import { type Fr } from '@aztec/foundation/fields';

import { EcdsaSignature } from '../ecdsa/signature.js';
import { SchnorrSignature } from '../schnorr/signature.js';

/**
 * Interface to represent a signature.
 */
export interface Signature {
  /**
   * Serializes to a buffer.
   * @returns A buffer.
   */
  toBuffer(): Buffer;
  /**
   * Serializes to an array of fields.
   * @returns Fields.
   */
  toFields(): Fr[];
}

export { EcdsaSignature, SchnorrSignature };
