import { BarretenbergSync } from '@aztec/bb.js';

import { Buffer } from 'buffer';

/**
 * AES-128-CBC encryption/decryption.
 */
export class Aes128 {
  /**
   * Encrypt a buffer using AES-128-CBC.
   * @param data - Data to encrypt.
   * @param iv - AES initialization vector.
   * @param key - Key to encrypt with.
   * @returns Encrypted data.
   */
  public async encryptBufferCBC(data: Uint8Array, iv: Uint8Array, key: Uint8Array) {
    const rawLength = data.length;
    const numPaddingBytes = 16 - (rawLength % 16);
    const paddingBuffer = Buffer.alloc(numPaddingBytes);
    // input num bytes needs to be a multiple of 16 and at least 1 byte
    // node uses PKCS#7-Padding scheme, where padding byte value = the number of padding bytes
    paddingBuffer.fill(numPaddingBytes);
    const input = Buffer.concat([data, paddingBuffer]);

    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.aesEncrypt({
      plaintext: input,
      iv,
      key,
      length: input.length,
    });
    return Buffer.from(response.ciphertext);
  }

  /**
   * Decrypt a buffer using AES-128-CBC.
   * We keep the padding in the returned buffer.
   * @param data - Data to decrypt.
   * @param iv - AES initialization vector.
   * @param key - Key to decrypt with.
   * @returns Decrypted data.
   */
  public async decryptBufferCBCKeepPadding(data: Uint8Array, iv: Uint8Array, key: Uint8Array): Promise<Buffer> {
    await BarretenbergSync.initSingleton();
    const api = BarretenbergSync.getSingleton();
    const response = api.aesDecrypt({
      ciphertext: data,
      iv,
      key,
      length: data.length,
    });
    return Buffer.from(response.plaintext);
  }

  /**
   * Decrypt a buffer using AES-128-CBC.
   * @param data - Data to decrypt.
   * @param iv - AES initialization vector.
   * @param key - Key to decrypt with.
   * @returns Decrypted data.
   */
  public async decryptBufferCBC(data: Uint8Array, iv: Uint8Array, key: Uint8Array) {
    const paddedBuffer = await this.decryptBufferCBCKeepPadding(data, iv, key);
    const paddingToRemove = paddedBuffer[paddedBuffer.length - 1];
    return paddedBuffer.subarray(0, paddedBuffer.length - paddingToRemove);
  }
}
