import { type ProvingStats, Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { SentTx } from './sent_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(
    protected wallet: Wallet,
    tx: Tx,
    // eslint-disable-next-line jsdoc/require-jsdoc
    public stats?: ProvingStats,
  ) {
    super(tx.data, tx.clientIvcProof, tx.contractClassLogs, tx.publicFunctionCalldata);
  }

  // Clone the TX data to get a serializable object.
  protected getPlainDataTx(): Tx {
    return new Tx(this.data, this.clientIvcProof, this.contractClassLogs, this.publicFunctionCalldata);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public send(): SentTx {
    const promise = (() => {
      return this.wallet.sendTx(this.getPlainDataTx());
    })();

    return new SentTx(this.wallet, promise);
  }
}
