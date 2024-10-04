import { type PXE, Tx } from '@aztec/circuit-types';

import { SentTx, type Wallet } from '../index.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(protected wallet: PXE | Wallet, tx: Tx) {
    super(
      tx.data,
      tx.clientIvcProof,
      tx.noteEncryptedLogs,
      tx.encryptedLogs,
      tx.unencryptedLogs,
      tx.enqueuedPublicFunctionCalls,
      tx.publicTeardownFunctionCall,
    );
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public send(): SentTx {
    const promise = (() => {
      // Clone the TX data to avoid serializing the ProvenTx object.
      return this.wallet.sendTx(
        new Tx(
          this.data,
          this.clientIvcProof,
          this.noteEncryptedLogs,
          this.encryptedLogs,
          this.unencryptedLogs,
          this.enqueuedPublicFunctionCalls,
          this.publicTeardownFunctionCall,
        ),
      );
    })();

    return new SentTx(this.wallet, promise);
  }
}
