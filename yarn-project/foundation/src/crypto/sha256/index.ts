import { default as hash } from 'hash.js';

import { Fr } from '../../fields/fields.js';
import { truncateAndPad } from '../../serialize/free_funcs.js';
import { type Bufferable, serializeToBuffer } from '../../serialize/serialize.js';

export const sha256 = (data: Buffer) => Buffer.from(hash.sha256().update(data).digest());

export const sha256Trunc = (data: Buffer) => truncateAndPad(sha256(data));

export const sha256ToField = (data: Bufferable[]) => {
  const buffer = serializeToBuffer(data);
  return Fr.fromBuffer(sha256Trunc(buffer));
};

export const sha512 = (data: Buffer) => Buffer.from(hash.sha512().update(data).digest());

/**
 * @dev We don't truncate in this function (unlike in sha256ToField) because this function is used in situations where
 * we don't care only about collision resistance but we need the output to be uniformly distributed as well. This is
 * because we use it as a pseudo-random function.
 */
export const sha512ToField = (data: Bufferable[]) => {
  const buffer = serializeToBuffer(data);
  return Fr.fromBufferReduce(sha512(buffer));
};
