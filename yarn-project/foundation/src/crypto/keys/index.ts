import { BarretenbergSync, RawBuffer } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';

export async function vkAsFieldsMegaHonk(input: Buffer): Promise<Fr[]> {
  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const result = api.acirVkAsFieldsMegaHonk(new RawBuffer(input));

  return result.map(bbFr => Fr.fromBuffer(Buffer.from(bbFr.toBuffer()))); // TODO(#4189): remove this conversion
}
