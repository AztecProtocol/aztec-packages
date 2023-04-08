import { PrivateKernelPublicInputs, UInt8Vector } from '@aztec/circuits.js';
import { UnverifiedData } from '@aztec/unverified-data';
import { createTxHash } from './create_tx_hash.js';
import { TxHash } from './tx_hash.js';

/**
 * The interface of an L2 transaction.
 */
export class Tx {
  /**
   *
   * @param data - Tx inputs.
   * @param proof - Tx proof.
   * @param unverifiedData  - Information not needed to verify the tx (e.g. encrypted note pre-images etc.)
   * @param isEmpty - Whether this is a placeholder empty tx.
   */
  constructor(
    public readonly data: PrivateKernelPublicInputs,
    public readonly proof: UInt8Vector,
    public readonly unverifiedData: UnverifiedData,
    private hash?: TxHash,
    public readonly isEmpty = false,
  ) {}

  /**
   * Construct & return transaction hash.
   * @returns The transaction's hash.
   */
  get txHash() {
    if (!this.hash) {
      this.hash = createTxHash(this.data.end);
    }
    return this.hash;
  }
}
