import { BarretenbergLazy, RawBuffer } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';

export async function vkAsFieldsMegaHonk(input: Buffer): Promise<Fr[]> {
  const api = await BarretenbergLazy.getSingleton();
  const result = await api.acirVkAsFieldsMegaHonk(new RawBuffer(input));

  return result.map(bbFr => Fr.fromBuffer(Buffer.from(bbFr.toBuffer()))); // TODO(#4189): remove this conversion
}
