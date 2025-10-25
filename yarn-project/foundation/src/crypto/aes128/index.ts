/**
 * AES-128-CBC encryption/decryption - delegates to barretenberg/ts.
 * This wrapper maintains Buffer return types for backward compatibility.
 */
import { Aes128 as Aes128Impl } from '@aztec/bb.js/crypto/aes128';

import { Buffer } from 'buffer';

const aesImpl = new Aes128Impl();

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
    const result = await aesImpl.encryptBufferCBC(data, iv, key);
    return Buffer.from(result);
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
    const result = await aesImpl.decryptBufferCBCKeepPadding(data, iv, key);
    return Buffer.from(result);
  }

  /**
   * Decrypt a buffer using AES-128-CBC.
   * @param data - Data to decrypt.
   * @param iv - AES initialization vector.
   * @param key - Key to decrypt with.
   * @returns Decrypted data.
   */
  public async decryptBufferCBC(data: Uint8Array, iv: Uint8Array, key: Uint8Array) {
    const result = await aesImpl.decryptBufferCBC(data, iv, key);
    return Buffer.from(result);
  }
}
