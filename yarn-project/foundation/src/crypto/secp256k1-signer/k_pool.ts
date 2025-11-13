import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * Pre-generates and stores k values for non-deterministic ECDSA signing
 * Used for network red-teaming and testing duplicate signature behavior
 *
 * WARNING: Only for testing purposes. Non-deterministic k values can lead to
 * private key exposure if k is reused or predictable.
 */
export class KValuePool {
  private kValues: bigint[];

  constructor(poolSize: number) {
    this.kValues = [];
    this.generateKValues(poolSize);
  }

  /**
   * Generate cryptographically secure random k values
   * Each k must be in range [1, n-1] where n is secp256k1 curve order
   */
  private generateKValues(count: number): void {
    const n = secp256k1.CURVE.n;

    for (let i = 0; i < count; i++) {
      let k: bigint;
      do {
        // Generate random bytes and convert to bigint
        const randomBytes = secp256k1.utils.randomPrivateKey();
        k = this.bytesToNumberBE(randomBytes);
      } while (k === 0n || k >= n); // Ensure k is in valid range (0, n)

      this.kValues.push(k);
    }
  }

  /**
   * Get k value at specified index
   * @param index - The index of the k value to retrieve
   * @returns A valid k value for ECDSA signing
   * @throws Error if index is out of bounds
   */
  getK(index: number): bigint {
    if (index < 0 || index >= this.kValues.length) {
      throw new Error(`K value index ${index} out of bounds (pool size: ${this.kValues.length})`);
    }
    return this.kValues[index];
  }

  /**
   * Get total size of pool
   */
  getPoolSize(): number {
    return this.kValues.length;
  }

  /**
   * Convert byte array to bigint (big-endian)
   */
  private bytesToNumberBE(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
      result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
  }
}
