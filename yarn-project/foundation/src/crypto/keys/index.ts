import { BarretenbergSync } from '@aztec/bb.js';

import { Fr } from '../../curves/bn254/field.js';

export async function vkAsFieldsMegaHonk(input: Buffer): Promise<Fr[]> {
  await BarretenbergSync.initSingleton();
  const api = BarretenbergSync.getSingleton();
  const response = api.megaVkAsFields({ verificationKey: input });
  return response.fields.map(field => Fr.fromBuffer(Buffer.from(field)));
}
