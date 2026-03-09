import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

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
    const paddingBuffer = Buffer.alloc(numPaddingBytes);
    paddingBuffer.fill(numPaddingBytes);
    return Buffer.concat([data, paddingBuffer]);
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
    const expected = Buffer.concat([cipher.update(paddedData), cipher.final()]);

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
    const ciphertext = Buffer.concat([cipher.update(paddedData), cipher.final()]);

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    const expected = removePadding(Buffer.concat([decipher.update(ciphertext), decipher.final()]));

    const result: Buffer = await aes128.decryptBufferCBC(ciphertext, iv, key);

    expect(result).toEqual(expected);
  });

  it('should return garbage when decrypting with wrong key', async () => {
    const data = randomBytes(32);
    const key = randomBytes(16);
    const wrongKey = randomBytes(16);
    const iv = randomBytes(16);

    const ciphertext = await aes128.encryptBufferCBC(data, iv, key);
    const result = await aes128.decryptBufferCBC(ciphertext, iv, wrongKey);

    // Barretenberg decrypts to garbage, then blindly strips "padding" based on the last
    // garbage byte. The result is truncated garbage (often empty if that byte is large).
    expect(result).not.toEqual(data);
  });

  it('should not throw for ciphertext not a multiple of 16', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    const badCiphertext = randomBytes(17);
    // Barretenberg returns a same-length garbage buffer without throwing.
    // Padding removal then blindly strips based on the last garbage byte.
    await expect(aes128.decryptBufferCBC(badCiphertext, iv, key)).resolves.toBeDefined();
  });

  it('should return empty buffer for empty ciphertext', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    // Barretenberg returns empty, padding removal on empty buffer also returns empty.
    const result = await aes128.decryptBufferCBC(Buffer.alloc(0), iv, key);
    expect(result.length).toBe(0);
  });
});
