import { default as hash } from 'hash.js';

import { Fr } from '../../fields/index.js';

export const sha256 = (data: Buffer): Buffer => Buffer.from(hash.sha256().update(data).digest());
export const sha256TruncateToField = (data: Buffer): Fr => {
  const hashBuffer = sha256(data);

  const newLength = hashBuffer.length - 1;

  const truncatedBuffer = Buffer.alloc(hashBuffer.length - 1);

  // Copy the data from the original Buffer to the new one, except the last element
  hashBuffer.copy(truncatedBuffer, 0, 0, newLength);

  return Fr.fromBuffer(truncatedBuffer);
};
