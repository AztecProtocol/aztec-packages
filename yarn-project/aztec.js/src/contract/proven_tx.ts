import { type OffchainEffect, type ProvingStats, Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { SentTx } from './sent_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  #wallet: Wallet;

  constructor(
    wallet: Wallet,
    tx: Tx,
    /** The offchain effects emitted during the execution of the transaction. */
    public offchainEffects: OffchainEffect[],
    // eslint-disable-next-line jsdoc/require-jsdoc
    public stats?: ProvingStats,
  ) {
    super(tx.data, tx.clientIvcProof, tx.contractClassLogFields, tx.publicFunctionCalldata);
    this.#wallet = wallet;
  }

  protected get wallet(): Wallet {
    return this.#wallet;
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public send(): SentTx {
    const sendTx = () => this.#wallet.sendTx(this);

    return new SentTx(this.#wallet, sendTx);
  }
}
