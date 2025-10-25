/**
 * Verification key utilities - delegates to barretenberg/ts.
 * This wrapper maintains Fr return types for backward compatibility.
 */
import { vkAsFieldsMegaHonk as vkAsFieldsMegaHonkImpl } from '@aztec/bb.js/crypto/keys';

import { Fr } from '../../fields/fields.js';

export async function vkAsFieldsMegaHonk(input: Buffer): Promise<Fr[]> {
  const results = await vkAsFieldsMegaHonkImpl(input);
  return results.map(field => Fr.fromBuffer(Buffer.from(field.toBuffer())));
}
