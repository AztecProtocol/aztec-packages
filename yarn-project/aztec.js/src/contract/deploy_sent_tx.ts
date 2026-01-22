import { createLogger } from '@aztec/foundation/log';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { type TxHash, TxReceipt } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import type { ContractBase } from './contract_base.js';
import { SentTx, type WaitOpts } from './sent_tx.js';

/** Options related to waiting for a deployment tx. */
export type DeployedWaitOpts = WaitOpts & {
  /** Wallet to use for creating a contract instance. Uses the one set in the deployer constructor if not set. */
  wallet?: Wallet;
};

/** Extends a transaction receipt with a contract instance that represents the newly deployed contract. */
export class DeployTxReceipt<TContract extends ContractBase = ContractBase> extends TxReceipt {
  constructor(
    /** Instance of the newly deployed contract. */
    public contract: TContract,
    /** The deployed contract instance with address and metadata. */
    public instance: ContractInstanceWithAddress,
    /** Arguments for the tx receipt */
    ...args: ConstructorParameters<typeof TxReceipt>
  ) {
    super(...args);
  }

  /**
   * Creates a new instance out of a TxReceipt
   * @param contract - The contract class
   * @param instance - The deployed contract instance with address and metadata
   * @param receipt - The transaction receipt
   * @returns A new DeployTxReceipt instance
   */
  static fromTxReceipt<TContract extends ContractBase = ContractBase>(
    contract: TContract,
    instance: ContractInstanceWithAddress,
    receipt: TxReceipt,
  ): DeployTxReceipt<TContract> {
    return new DeployTxReceipt(
      contract,
      instance,
      receipt.txHash,
      receipt.status,
      receipt.executionResult,
      receipt.error,
      receipt.transactionFee,
      receipt.blockHash,
      receipt.blockNumber,
    );
  }
}

/**
 * A contract deployment transaction sent to the network, extending SentTx with methods to publish a contract instance.
 */
export class DeploySentTx<TContract extends ContractBase = ContractBase> extends SentTx {
  private log = createLogger('aztecjs:deploy_sent_tx');

  constructor(
    wallet: Wallet,
    sendTx: () => Promise<TxHash>,
    private postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract,
    /** A getter for the deployed contract instance */
    private instanceGetter: () => Promise<ContractInstanceWithAddress>,
  ) {
    super(wallet, sendTx);
  }

  /**
   * Returns the contract instance for this deployment.
   * @returns The deployed contract instance with address and metadata.
   */
  public async getInstance(): Promise<ContractInstanceWithAddress> {
    return await this.instanceGetter();
  }

  /**
   * Awaits for the tx to be mined and returns the contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The deployed contract instance.
   */
  public async deployed(opts?: DeployedWaitOpts): Promise<TContract> {
    const receipt = await this.wait(opts);
    this.log.info(`Contract ${receipt.instance.address.toString()} successfully deployed.`);
    return receipt.contract;
  }

  /**
   * Awaits for the tx to be mined and returns the receipt along with a contract instance. Throws if tx is not mined.
   * @param opts - Options for configuring the waiting for the tx to be mined.
   * @returns The transaction receipt with the deployed contract instance.
   */
  public override async wait(opts?: DeployedWaitOpts): Promise<DeployTxReceipt<TContract>> {
    const receipt = await super.wait(opts);
    // In the case of DeploySentTx we have a guarantee that this.walletOrNode is a Wallet so we can cast it to Wallet.
    const contractWallet = opts?.wallet ?? (this.walletOrNode as Wallet);
    if (!contractWallet) {
      throw new Error(`A wallet is required for creating a contract instance`);
    }
    const instance = await this.instanceGetter();
    const contract = this.postDeployCtor(instance, contractWallet) as TContract;
    return DeployTxReceipt.fromTxReceipt(contract, instance, receipt);
  }
}
