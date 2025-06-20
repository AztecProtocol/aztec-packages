import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ProvingStats, Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import type { Contract } from './contract.js';
import { DeploySentTx } from './deploy_sent_tx.js';
import { ProvenTx } from './proven_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract deployment.
 */
export class DeployProvenTx<TContract extends Contract = Contract> extends ProvenTx {
  constructor(
    wallet: Wallet,
    tx: Tx,
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private instanceGetter: () => Promise<ContractInstanceWithAddress>,
    stats?: ProvingStats,
  ) {
    super(wallet, tx, stats);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public override send(): DeploySentTx<TContract> {
    const promise = (() => {
      return this.wallet.sendTx(this.getPlainDataTx());
    })();

    return new DeploySentTx(this.wallet, promise, this.postDeployCtor, this.instanceGetter);
  }
}
