import { Tx } from '@aztec/circuit-types';

import {
  AztecAddress,
  Contract,
  ContractBase,
  ContractInstanceWithAddress,
  DeploySentTx,
  SentTx,
  Wallet,
} from '../index.js';

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

  public send(): SentTx {
    const promise = (async () => {
      return this.wallet.sendTx(this);
    })();

    return new SentTx(this.wallet, promise);
  }
}

export class DeployProvenTx<TContract extends ContractBase = Contract> extends ProvenTx {
  constructor(
    wallet: Wallet,
    tx: Tx,
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private instance: ContractInstanceWithAddress,
  ) {
    super(wallet, tx);
  }

  public override send(): DeploySentTx<TContract> {
    const promise = (async () => {
      return this.wallet.sendTx(this);
    })();

    return new DeploySentTx(this.wallet, promise, this.postDeployCtor, this.instance);
  }
}
