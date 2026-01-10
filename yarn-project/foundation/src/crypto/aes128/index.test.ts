import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { bufferAlloc, bufferConcat } from '../../buffer/index.js';
import { Aes128 } from './index.js';

describe('aes128', () => {
  let aes128!: Aes128;

  beforeAll(() => {
    aes128 = new Aes128();
  });

  // PKCS#7 padding
  const pad = (data: Buffer): Buffer => {
    const rawLength = data.length;
    const numPaddingBytes = 16 - (rawLength % 16);
    const paddingBuffer = bufferAlloc(numPaddingBytes);
    paddingBuffer.fill(numPaddingBytes);
    return bufferConcat([data, paddingBuffer]);
  };

  // PKCS#7 padding removal
  const removePadding = (paddedBuffer: Buffer): Buffer => {
    // We get padding length from the last byte - in PKCS#7 all the padded bytes contain padding length
    // and there is always some padding.
    const paddingToRemove = paddedBuffer[paddedBuffer.length - 1];
    return paddedBuffer.subarray(0, paddedBuffer.length - paddingToRemove);
  };

  it('should correctly encrypt input', async () => {
    const data = randomBytes(32);
    const key = randomBytes(16);
    const iv = randomBytes(16);

    const paddedData = pad(data);

    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const expected = bufferConcat([cipher.update(paddedData), cipher.final()]);

    const result: Buffer = await aes128.encryptBufferCBC(data, iv, key);

    expect(result).toEqual(expected);
  });

  it('should correctly decrypt input', async () => {
    const data = randomBytes(32);
    const key = randomBytes(16);
    const iv = randomBytes(16);

    const paddedData = pad(data);

    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const ciphertext = bufferConcat([cipher.update(paddedData), cipher.final()]);

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    const expected = removePadding(bufferConcat([decipher.update(ciphertext), decipher.final()]));

    const result: Buffer = await aes128.decryptBufferCBC(ciphertext, iv, key);

    expect(result).toEqual(expected);
  });
});
