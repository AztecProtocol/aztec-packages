import { createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import type { Contract } from './contract.js';
import type { ContractBase } from './contract_base.js';
import { SentTx, type WaitOpts } from './sent_tx.js';

/**
 * Configuration options for waiting for a deployment transaction to complete.
 *
 * @remarks
 * Extends WaitOpts with deployment-specific options for creating the contract instance.
 */
export type DeployedWaitOpts = WaitOpts & {
  /** Wallet to use for creating a contract instance. Uses the one set in the deployer constructor if not set. */
  wallet?: Wallet;
};

/**
 * Transaction receipt for a successful contract deployment.
 *
 * @remarks
 * Extends the standard TxReceipt with a contract instance property, providing immediate
 * access to the deployed contract for further interactions.
 *
 * @typeParam TContract - The type of the deployed contract
 */
export type DeployTxReceipt<TContract extends ContractBase = Contract> = FieldsOf<TxReceipt> & {
  /** Instance of the newly deployed contract. */
  contract: TContract;
};

/**
 * Represents a contract deployment transaction that has been sent to the Aztec network.
 *
 * @remarks
 * DeploySentTx extends SentTx with deployment-specific functionality, providing convenient
 * methods to wait for deployment completion and retrieve the deployed contract instance.
 *
 * Unlike regular transactions, deployment transactions result in a new contract being created
 * on the network. This class handles the additional complexity of contract instantiation after
 * the deployment transaction is mined.
 *
 * @typeParam TContract - The type of contract being deployed
 *
 * @example
 * ```typescript
 * // Deploy and get contract instance
 * const deployTx = Contract.deploy(wallet, artifact, [arg1, arg2])
 *   .send({ from: wallet.getAddress() });
 *
 * const contract = await deployTx.deployed();
 * console.log('Contract deployed at:', contract.address.toString());
 * ```
 *
 * @example
 * ```typescript
 * // Get detailed receipt including contract instance
 * const deployTx = deployMethod.send({ from: wallet.getAddress() });
 * const receipt = await deployTx.wait();
 *
 * console.log('Deployment status:', receipt.status);
 * console.log('Gas used:', receipt.gasUsed);
 * console.log('Contract address:', receipt.contract.address);
 *
 * // Use the deployed contract
 * const result = await receipt.contract.methods.getValue().simulate();
 * ```
 *
 * @example
 * ```typescript
 * // Get transaction hash before waiting
 * const deployTx = deployMethod.send({ from: wallet.getAddress() });
 * const txHash = await deployTx.getTxHash();
 * console.log('Deployment tx:', txHash.toString());
 *
 * // Wait for completion with custom timeout
 * const contract = await deployTx.deployed({ timeout: 120 });
 * ```
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
   * Waits for the deployment transaction to be mined and returns the deployed contract instance.
   *
   * @remarks
   * This is a convenience method that combines waiting for transaction confirmation with
   * retrieving the contract instance. It's equivalent to calling `wait()` and accessing
   * the `contract` property from the receipt.
   *
   * @param opts - Options for configuring transaction wait behavior
   * @returns The fully deployed and initialized contract instance
   *
   * @throws Will throw if the transaction fails, is dropped, or reverts
   * @throws Will throw if the deployment times out
   *
   * @example
   * ```typescript
   * const contract = await deployTx.deployed();
   * await contract.methods.initialize().send().wait();
   * ```
   *
   * @example
   * ```typescript
   * // With custom wait options
   * const contract = await deployTx.deployed({
   *   timeout: 180,
   *   interval: 5
   * });
   * ```
   */
  public async deployed(opts?: DeployedWaitOpts): Promise<TContract> {
    const receipt = await this.wait(opts);
    const instance = await this.instanceGetter();
    this.log.info(`Contract ${instance.address.toString()} successfully deployed.`);
    return receipt.contract;
  }

  /**
   * Waits for the deployment transaction to be mined and returns the receipt with contract instance.
   *
   * @remarks
   * This method provides complete deployment information including transaction details (gas used,
   * status, block number) and the deployed contract instance. Use this when you need both the
   * receipt data and the contract.
   *
   * @param opts - Options for configuring transaction wait behavior
   * @returns A deployment receipt containing transaction details and the contract instance
   *
   * @throws Will throw if the transaction fails, is dropped, or reverts (unless dontThrowOnRevert is true)
   * @throws Will throw if the deployment times out
   *
   * @example
   * ```typescript
   * const receipt = await deployTx.wait();
   * console.log('Status:', receipt.status);
   * console.log('Block:', receipt.blockNumber);
   * console.log('Gas used:', receipt.gasUsed);
   *
   * // Access the deployed contract
   * const contract = receipt.contract;
   * await contract.methods.setup().send().wait();
   * ```
   */
  public override async wait(opts?: DeployedWaitOpts): Promise<DeployTxReceipt<TContract>> {
    const receipt = await super.wait(opts);
    // In the case of DeploySentTx we have a guarantee that this.walletOrNode is a Wallet so we can cast it to Wallet.
    const contractWallet = opts?.wallet ?? (this.walletOrNode as Wallet);
    if (!contractWallet) {
      throw new Error(`A wallet is required for creating a contract instance`);
    }
    const instance = await this.instanceGetter();
    const contract = (await this.postDeployCtor(instance.address, contractWallet)) as TContract;
    return { ...receipt, contract };
  }
}
