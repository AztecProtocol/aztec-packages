import { default as hash } from 'hash.js';

import { Fr } from '../../fields/index.js';

export const sha256 = (data: Buffer): Buffer => Buffer.from(hash.sha256().update(data).digest());
// export const sha256ToField = (data: Buffer): Fr => Fr.fromBufferReduce(sha256(data));  // this would take prime modulus of sha output
export const sha256ToField = (data: Buffer): Fr => {
  // Hash the input bytes using SHA-256, then interpret the output as two 128 bit numbers
  // and
  const hashBuffer = sha256(data);

  let high = 0n;
  let low = 0n;
  let v = 1n;

  for (let i = 0; i < 16; i++) {
    high += BigInt(hashBuffer[15 - i]) * v;
    low += BigInt(hashBuffer[31 - i]) * v;
    v *= BigInt(256);
  }

  const hashInAField = (low + high * v) % Fr.MODULUS;

  return new Fr(hashInAField);
};
