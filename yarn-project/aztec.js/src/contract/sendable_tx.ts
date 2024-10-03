import { Tx } from '@aztec/circuit-types';

import { SentTx, Wallet } from '../index.js';

export class SendableTx extends Tx {
  constructor(private wallet: Wallet, private tx: Tx) {
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

  public send(): SentTx {
    const promise = (async () => {
      return this.wallet.sendTx(this);
    })();

    return new SentTx(this.wallet, promise);
  }
}
