import { type OffchainEffect, type ProvingStats, Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { SentTx } from './sent_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(
    protected wallet: Wallet,
    tx: Tx,
    /** The offchain effects emitted during the execution of the transaction. */
    public offchainEffects: OffchainEffect[],
    // eslint-disable-next-line jsdoc/require-jsdoc
    public stats?: ProvingStats,
  ) {
    super(tx.data, tx.clientIvcProof, tx.contractClassLogFields, tx.publicFunctionCalldata);
  }

  // Clone the TX data to get a serializable object.
  protected getPlainDataTx(): Tx {
    return new Tx(this.data, this.clientIvcProof, this.contractClassLogFields, this.publicFunctionCalldata);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public send(): SentTx {
    const sendTx = () => this.wallet.sendTx(this.getPlainDataTx());

    return new SentTx(this.wallet, sendTx);
  }
}
