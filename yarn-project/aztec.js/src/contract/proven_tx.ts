import { Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { SentTx } from './sent_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(protected wallet: Wallet, tx: Tx) {
    super(tx.data, tx.clientIvcProof, tx.contractClassLogs, tx.publicFunctionCalldata);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public send(): SentTx {
    const promise = (() => {
      return this.wallet.sendTx(this);
    })();

    return new SentTx(this.wallet, promise);
  }
}
