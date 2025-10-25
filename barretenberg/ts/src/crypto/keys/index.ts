/**
 * Verification key utilities using barretenberg bbapi.
 */

import { BarretenbergSync } from '../../barretenberg/index.js';
import { Bn254Fr } from '../../types/fields.js';

/**
 * Convert a MegaHonk verification key to field elements.
 * @param input - The verification key buffer.
 * @returns Array of field elements.
 */
export async function vkAsFieldsMegaHonk(input: Uint8Array): Promise<Bn254Fr[]> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.megaVkAsFields({ verificationKey: input });
  return response.fields.map(field => Bn254Fr.fromBuffer(Buffer.from(field)));
}
