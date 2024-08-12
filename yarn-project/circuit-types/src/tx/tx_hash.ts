import { Buffer32 } from '../../../foundation/src/buffer/index.js';

/**
 * A class representing hash of Aztec transaction.
 */
export class TxHash extends Buffer32 {
  constructor(
    /**
     * The buffer containing the hash.
     */
    hash: Buffer,
  ) {
    super(hash);
  }
}
