import nodeCrypto from 'crypto';

export const randomBytes = (len: number) => {
  return nodeCrypto.randomBytes(len) as Buffer;
};
