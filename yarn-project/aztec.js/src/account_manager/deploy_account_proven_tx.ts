import { ProvenTx } from '../contract/proven_tx.js';
import {
  type AztecAddress,
  type Contract,
  type ContractBase,
  type ContractInstanceWithAddress,
  DeploySentTx,
  type PXE,
  type Tx,
  type Wallet,
} from '../index.js';

/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of a contract deployment.
 */
export class DeployProvenTx<TContract extends ContractBase = Contract> extends ProvenTx {
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
      return this.wallet.sendTx(this);
    })();

    return new DeploySentTx(this.wallet, promise, this.postDeployCtor, this.instance);
  }
}
