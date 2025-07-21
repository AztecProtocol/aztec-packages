import { createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import type { Contract } from './contract.js';
import type { ContractBase } from './contract_base.js';
import { SentTx, type WaitOpts } from './sent_tx.js';

/** Options related to waiting for a deployment tx. */
export type DeployedWaitOpts = WaitOpts & {
  /** Wallet to use for creating a contract instance. Uses the one set in the deployer constructor if not set. */
  wallet?: Wallet;
};

/** Extends a transaction receipt with a contract instance that represents the newly deployed contract. */
export type DeployTxReceipt<TContract extends ContractBase = Contract> = FieldsOf<TxReceipt> & {
  /** Instance of the newly deployed contract. */
  contract: TContract;
};

/**
 * A contract deployment transaction sent to the network, extending SentTx with methods to publish a contract instance.
 */
export class DeploySentTx<TContract extends Contract = Contract> extends SentTx {
  private log = createLogger('aztecjs:deploy_sent_tx');

  constructor(
    wallet: Wallet,
    sendTx: () => Promise<TxHash>,
    private postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    /** A getter for the deployed contract instance */
    public instanceGetter: () => Promise<ContractInstanceWithAddress>,
  ) {
    super(wallet, sendTx);
  }

  /**
   * Awaits for the tx to be mined and returns the contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The deployed contract instance.
   */
  public async deployed(opts?: DeployedWaitOpts): Promise<TContract> {
    const receipt = await this.wait(opts);
    const instance = await this.instanceGetter();
    this.log.info(`Contract ${instance.address.toString()} successfully deployed.`);
    return receipt.contract;
  }

  /**
   * Awaits for the tx to be mined and returns the receipt along with a contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt with the deployed contract instance.
   */
  public override async wait(opts?: DeployedWaitOpts): Promise<DeployTxReceipt<TContract>> {
    const receipt = await super.wait(opts);
    const contract = await this.getContractObject(opts?.wallet);
    return { ...receipt, contract };
  }

  protected async getContractObject(wallet?: Wallet): Promise<TContract> {
    const isWallet = (pxeWalletOrNode: Wallet | AztecNode | PXE): pxeWalletOrNode is Wallet =>
      !!(pxeWalletOrNode as Wallet).createTxExecutionRequest;
    const contractWallet = wallet ?? (isWallet(this.pxeWalletOrNode) && this.pxeWalletOrNode);
    if (!contractWallet) {
      throw new Error(`A wallet is required for creating a contract instance`);
    }
    const instance = await this.instanceGetter();
    return this.postDeployCtor(instance.address, contractWallet) as Promise<TContract>;
  }
}
