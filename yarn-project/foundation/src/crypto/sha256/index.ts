import { BarretenbergSync, RawBuffer } from '@aztec/bb.js';

import { Fr } from '../../fields/fields.js';
import { truncateAndPad } from '../../serialize/free_funcs.js';
import { type Bufferable, serializeToBuffer } from '../../serialize/serialize.js';

export function sha256(data: Buffer) {
  return Buffer.from(BarretenbergSync.getSingleton().sha256Hash(new RawBuffer(data), data.length).toBuffer());
}

export const sha256Trunc = (data: Buffer) => truncateAndPad(sha256(data));

export const sha256ToField = (data: Bufferable[]) => {
  const buffer = serializeToBuffer(data);
  return Fr.fromBuffer(sha256Trunc(buffer));
};
