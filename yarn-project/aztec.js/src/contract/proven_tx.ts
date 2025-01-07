import { type PXE, Tx } from '@aztec/circuit-types';

import { type Wallet } from '../account/index.js';
import { SentTx } from './sent_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(protected wallet: PXE | Wallet, tx: Tx) {
    super(
      tx.data,
      tx.clientIvcProof,
      tx.publicLogs,
      tx.contractClassLogs,
      tx.enqueuedPublicFunctionCalls,
      tx.publicTeardownFunctionCall,
    );
  }

  // Clone the TX data to get a serializable object.
  protected getPlainDataTx(): Tx {
    return new Tx(
      this.data,
      this.clientIvcProof,
      this.publicLogs,
      this.contractClassLogs,
      this.enqueuedPublicFunctionCalls,
      this.publicTeardownFunctionCall,
    );
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
