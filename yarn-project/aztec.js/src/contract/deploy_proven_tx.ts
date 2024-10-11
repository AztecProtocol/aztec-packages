import { type PXE, type Tx } from '@aztec/circuit-types';
import { type AztecAddress, type ContractInstanceWithAddress } from '@aztec/circuits.js';

import { type Wallet } from '../account/index.js';
import { type Contract } from './contract.js';
import { DeploySentTx } from './deploy_sent_tx.js';
import { ProvenTx } from './proven_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract deployment.
 */
export class DeployProvenTx<TContract extends Contract = Contract> extends ProvenTx {
  constructor(
    wallet: PXE | Wallet,
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
      return this.wallet.sendTx(this.getPlainDataTx());
    })();

    return new DeploySentTx(this.wallet, promise, this.postDeployCtor, this.instance);
  }
}
