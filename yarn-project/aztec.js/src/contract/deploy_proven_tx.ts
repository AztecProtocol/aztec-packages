import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { OffchainEffect, ProvingStats, TxProvingResult } from '@aztec/stdlib/tx';
import { Tx } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import type { Contract } from './contract.js';
import { DeploySentTx } from './deploy_sent_tx.js';
import { ProvenTx } from './proven_tx.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract deployment.
 */
export class DeployProvenTx<TContract extends Contract = Contract> extends ProvenTx {
  private constructor(
    wallet: Wallet,
    tx: Tx,
    offchainEffects: OffchainEffect[],
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private instanceGetter: () => Promise<ContractInstanceWithAddress>,
    stats?: ProvingStats,
  ) {
    super(wallet, tx, offchainEffects, stats);
  }

  static async fromProvingResult<TContract extends Contract = Contract>(
    wallet: Wallet,
    txProvingResult: TxProvingResult,
    postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    instanceGetter: () => Promise<ContractInstanceWithAddress>,
    stats?: ProvingStats,
  ): Promise<DeployProvenTx<TContract>> {
    const tx = await txProvingResult.toTx();
    return new DeployProvenTx(wallet, tx, txProvingResult.getOffchainEffects(), postDeployCtor, instanceGetter, stats);
  }

  /**
   * Sends the transaction to the network via the provided wallet.
   */
  public override send(): DeploySentTx<TContract> {
    const sendTx = () => this.wallet.sendTx(this);

    return new DeploySentTx(this.wallet, sendTx, this.postDeployCtor, this.instanceGetter);
  }
}
