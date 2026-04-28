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

  // Encrypt data with Node's built-in AES-128-CBC
  const encrypt = (data: Buffer, key: Buffer, iv: Buffer): Buffer => {
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(pad(data)), cipher.final()]);
  };

  it('should correctly encrypt input', async () => {
    const data = randomBytes(32);
    const key = randomBytes(16);
    const iv = randomBytes(16);

    const result: Buffer = await aes128.encryptBufferCBC(data, iv, key);

    expect(result).toEqual(encrypt(data, key, iv));
  });

  it('should correctly decrypt input', async () => {
    const data = randomBytes(32);
    const key = randomBytes(16);
    const iv = randomBytes(16);

    const ciphertext = encrypt(data, key, iv);

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const expected = decrypted.subarray(0, decrypted.length - decrypted[decrypted.length - 1]);

    const result: Buffer = await aes128.decryptBufferCBC(ciphertext, iv, key);

    expect(result).toEqual(expected);
  });

  it('should throw on invalid PKCS#7 padding length (0)', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    // Craft a ciphertext whose last plaintext byte decrypts to 0x00 (invalid padding length).
    // We encrypt a block where the last byte is 0x00 using raw (no-padding) encryption.
    const plaintext = Buffer.alloc(16, 0x00);
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    await expect(aes128.decryptBufferCBC(ciphertext, iv, key)).rejects.toThrow('Invalid PKCS#7 padding length: 0');
  });

  it('should throw on invalid PKCS#7 padding length (> 16)', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    // Craft a ciphertext whose last plaintext byte is 0x11 = 17, which exceeds the block size.
    const plaintext = Buffer.alloc(16, 0x11);
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    await expect(aes128.decryptBufferCBC(ciphertext, iv, key)).rejects.toThrow('Invalid PKCS#7 padding length: 17');
  });

  it('should throw when padding bytes are inconsistent', async () => {
    const key = randomBytes(16);
    const iv = randomBytes(16);
    // Last byte says padding length is 4, but the 3 bytes before it are not 0x04.
    const plaintext = Buffer.alloc(16, 0x00);
    plaintext[15] = 0x04;
    plaintext[14] = 0x04;
    plaintext[13] = 0x04;
    plaintext[12] = 0x01; // should be 0x04 — inconsistent
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(false);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    await expect(aes128.decryptBufferCBC(ciphertext, iv, key)).rejects.toThrow('Invalid PKCS#7 padding');
  });
});
