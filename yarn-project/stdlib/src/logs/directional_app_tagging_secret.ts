import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { type Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';

import { z } from 'zod';

import type { AztecAddress } from '../aztec-address/index.js';
import type { CompleteAddress } from '../contract/complete_address.js';
import { computeAddressSecret, computePreaddress } from '../keys/derivation.js';

/**
 * Directional application tagging secret used for log tagging.
 *
 * "Directional" because the derived secret is bound to the recipient
 * address: A→B differs from B→A even with the same participants and app.
 *
 * Note: It's a bit unfortunate that this type resides in `stdlib` as the rest of the tagging functionality resides
 * in `pxe/src/tagging`. We need to use this type in `PreTag` that in turn is used by other types
 * in stdlib hence there doesn't seem to be a good way around this.
 */
export class DirectionalAppTaggingSecret {
  private constructor(public readonly value: Fr) {}

  /**
   * Derives shared tagging secret and from that, the app address and recipient derives the directional app tagging
   * secret.
   *
   * @param localAddress - The complete address of entity A in the shared tagging secret derivation scheme
   * @param localIvsk - The incoming viewing secret key of entity A
   * @param externalAddress - The address of entity B in the shared tagging secret derivation scheme
   * @param app - Contract address to silo the secret to
   * @param recipient - Recipient of the log. Defines the "direction of the secret".
   * @returns The secret that can be used along with an index to compute a tag to be included in a log.
   */
  static async compute(
    localAddress: CompleteAddress,
    localIvsk: Fq,
    externalAddress: AztecAddress,
    app: AztecAddress,
    recipient: AztecAddress,
  ): Promise<DirectionalAppTaggingSecret> {
    const taggingSecretPoint = await computeSharedTaggingSecret(localAddress, localIvsk, externalAddress);
    const appTaggingSecret = await poseidon2Hash([taggingSecretPoint.x, taggingSecretPoint.y, app]);
    const directionalAppTaggingSecret = await poseidon2Hash([appTaggingSecret, recipient]);

    return new DirectionalAppTaggingSecret(directionalAppTaggingSecret);
  }

  toString(): string {
    return this.value.toString();
  }

  static fromString(str: string): DirectionalAppTaggingSecret {
    return new DirectionalAppTaggingSecret(Fr.fromString(str));
  }
}

// Returns shared tagging secret computed with Diffie-Hellman key exchange.
async function computeSharedTaggingSecret(
  localAddress: CompleteAddress,
  localIvsk: Fq,
  externalAddress: AztecAddress,
): Promise<Point> {
  const knownPreaddress = await computePreaddress(await localAddress.publicKeys.hash(), localAddress.partialAddress);
  // TODO: #8970 - Computation of address point from x coordinate might fail
  const externalAddressPoint = await externalAddress.toAddressPoint();
  // Given A (local complete address) -> B (external address) and h == preaddress
  // Compute shared secret as S = (h_A + local_ivsk_A) * Addr_Point_B

  // Beware! h_a + local_ivsk_a (also known as the address secret) can lead to an address point with a negative
  // y-coordinate, since there's two possible candidates computeAddressSecret takes care of selecting the one that
  // leads to a positive y-coordinate, which is the only valid address point
  return Grumpkin.mul(externalAddressPoint, await computeAddressSecret(knownPreaddress, localIvsk));
}

export const DirectionalAppTaggingSecretSchema = z.object({
  value: Fr.schema,
});
