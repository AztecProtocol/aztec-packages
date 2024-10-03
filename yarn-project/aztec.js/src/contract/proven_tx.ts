import { Tx } from '@aztec/circuit-types';

import {
  type AztecAddress,
  type Contract,
  type ContractBase,
  type ContractInstanceWithAddress,
  DeploySentTx,
  SentTx,
  type Wallet,
} from '../index.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract interaction.
 */
export class ProvenTx extends Tx {
  constructor(protected wallet: Wallet, tx: Tx) {
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
      return this.wallet.sendTx(this);
    })();

    return new SentTx(this.wallet, promise);
  }
}

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract deployment.
 */
export class DeployProvenTx<TContract extends ContractBase = Contract> extends ProvenTx {
  constructor(
    wallet: Wallet,
    tx: Tx,
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private instance: ContractInstanceWithAddress,
  ) {
    super(wallet, tx);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public override send(): DeploySentTx<TContract> {
    const promise = (() => {
      return this.wallet.sendTx(this);
    })();

    return new DeploySentTx(this.wallet, promise, this.postDeployCtor, this.instance);
  }
}
