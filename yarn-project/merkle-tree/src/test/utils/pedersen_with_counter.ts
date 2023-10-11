import { Pedersen } from '../../index.js';

/**
 * A test utility allowing us to count the number of times the compress function has been called.
 * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
 * purposes.
 */
export class PedersenWithCounter extends Pedersen {
  /**
   * The number of times the compress function has been called.
   */
  public compressCounter = 0;

  /**
   * Compresses two 32-byte hashes.
   * @param lhs - The first hash.
   * @param rhs - The second hash.
   * @returns The new 32-byte hash.
   * @deprecated Don't call pedersen directly in production code. Instead, create suitably-named functions for specific
   * purposes.
   */
  public compress(lhs: Uint8Array, rhs: Uint8Array): Buffer {
    this.compressCounter++;
    return super.compress(lhs, rhs);
  }

  /**
   * Resets the compress counter.
   * @returns void
   */
  public resetCounter() {
    this.compressCounter = 0;
  }
}
