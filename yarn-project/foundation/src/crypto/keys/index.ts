import { BarretenbergSync, RawBuffer } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';

export function vkAsFieldsMegaHonk(input: Buffer): Fr[] {
  return BarretenbergSync.getSingleton()
    .acirVkAsFieldsMegaHonk(new RawBuffer(input))
    .map(bbFr => Fr.fromBuffer(Buffer.from(bbFr.toBuffer()))); // TODO(#4189): remove this conversion
}
