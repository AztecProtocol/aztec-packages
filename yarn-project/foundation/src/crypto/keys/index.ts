import { BarretenbergSync } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';

export async function vkAsFieldsMegaHonk(input: Buffer): Promise<Fr[]> {
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  // TODO: Is this mega honk? I think it's ultra. Issue?
  const response = await api.vkAsFields({ verificationKey: input });
  return response.fields.map(field => Fr.fromBuffer(Buffer.from(field)));
}
