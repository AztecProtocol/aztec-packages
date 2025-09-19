import type { FeePaymentMethod } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountContract } from '../account/account_contract.js';
import { AccountWithSecretKey } from '../account/account_with_secret_key.js';
import type { Salt } from '../account/index.js';
import type { AccountInterface } from '../account/interface.js';
import { Contract } from '../contract/contract.js';
import { DeployAccountSentTx } from '../contract/deploy_account_sent_tx.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import { DefaultWaitOpts, type WaitOpts } from '../contract/sent_tx.js';
import { AccountEntrypointMetaPaymentMethod } from '../fee/account_entrypoint_meta_payment_method.js';
import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { Wallet } from './wallet.js';

/**
 * Options to deploy an account contract.
 */
export type DeployAccountOptions = Pick<
  DeployOptions,
  'fee' | 'skipClassPublication' | 'skipInstancePublication' | 'skipInitialization'
> & {
  /**
   * Account used for any txs to initialize and/or publish the account contract. Must be funded in order to pay for the fee.
   */
  deployAccount?: AztecAddress;
};

/**
 * Manages a user account. Provides methods for calculating the account's address, deploying the account contract,
 * and creating and registering the user wallet in the PXE Service.
 */
export class AccountManager {
  private constructor(
    private wallet: Wallet,
    private pxe: PXE,
    private secretKey: Fr,
    private accountContract: AccountContract,
    private instance: ContractInstanceWithAddress,
    /**
     * Contract instantiation salt for the account contract
     */
    public readonly salt: Salt,
  ) {}

  static async create(wallet: Wallet, pxe: PXE, secretKey: Fr, accountContract: AccountContract, salt?: Salt) {
    const { publicKeys } = await deriveKeys(secretKey);
    salt = salt !== undefined ? new Fr(salt) : Fr.random();

    const { constructorName, constructorArgs } = (await accountContract.getInitializationFunctionAndArgs()) ?? {
      constructorName: undefined,
      constructorArgs: undefined,
    };

    const artifact = await accountContract.getContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArtifact: constructorName,
      constructorArgs,
      salt: salt,
      publicKeys,
    });

    return new AccountManager(wallet, pxe, secretKey, accountContract, instance, salt);
  }

  protected getPublicKeys() {
    return this.instance.publicKeys;
  }

  protected getPublicKeysHash() {
    return this.getPublicKeys().hash();
  }

  /**
   * Returns the entrypoint for this account as defined by its account contract.
   * @returns An entrypoint.
   */
  public async getAccountInterface(): Promise<AccountInterface> {
    const chainInfo = await this.wallet.getChainInfo();
    const completeAddress = await this.getCompleteAddress();
    return this.accountContract.getInterface(completeAddress, chainInfo);
  }

  /**
   * Gets the calculated complete address associated with this account.
   * Does not require the account to have been published for public execution.
   * @returns The address, partial address, and encryption public key.
   */
  public getCompleteAddress(): Promise<CompleteAddress> {
    return CompleteAddress.fromSecretKeyAndInstance(this.secretKey, this.instance);
  }

  /**
   * Gets the address for this given account.
   * Does not require the account to have been published for public execution.
   * @returns The address.
   */
  public getAddress() {
    return this.instance.address;
  }

  /**
   * Returns the contract instance definition associated with this account.
   * Does not require the account to have been published for public execution.
   * @returns ContractInstance instance.
   */
  public getInstance(): ContractInstanceWithAddress {
    return this.instance;
  }

  /**
   * Returns a Wallet instance associated with this account. Use it to create Contract
   * instances to be interacted with from this account.
   * @returns A Wallet instance.
   */
  public async getAccount(): Promise<AccountWithSecretKey> {
    const accountInterface = await this.getAccountInterface();
    return new AccountWithSecretKey(accountInterface, this.secretKey, this.salt);
  }

  /**
   * Returns the account contract that backs this account.
   * @returns The account contract
   */
  getAccountContract(): AccountContract {
    return this.accountContract;
  }

  /**
   * Add this account in the PXE Service and returns the associated wallet. Adding
   * the account to the PXE Service is required for managing private state associated with it.
   * Use the returned wallet to create Contract instances to be interacted with from this account.
   * @param opts - Options to wait for the account to be synched.
   * @returns A Wallet instance.
   */
  public async register(): Promise<AccountWithSecretKey> {
    await this.pxe.registerContract({
      artifact: await this.accountContract.getContractArtifact(),
      instance: this.getInstance(),
    });

    await this.pxe.registerAccount(this.secretKey, (await this.getCompleteAddress()).partialAddress);

    return this.getAccount();
  }

  /**
   * Returns the pre-populated ContractSetupMethods which can prepare a tx to
   * initialize and/or publish this account's account contract (depending on the contract's design).
   * If no wallet is provided, it uses a signerless wallet with the multi call entrypoint
   * @param deployWallet - Wallet used for any txs that are needed to
   * set up the account contract for use.
   * @returns A ContractSetupMethods instance that can set up this account contract for use
   */
  public async getDeployMethod(): Promise<DeployMethod> {
    const artifact = await this.accountContract.getContractArtifact();

    if (!(await this.hasInitializer())) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/15576):
      // there should be a path which enables an account contract's class & instance to be published,
      // even if the account contract doesn't have an initializer function. This should not throw.
      throw new Error(`Account contract ${artifact.name} does not have an initializer function to call.`);
    }

    const completeAddress = await this.getCompleteAddress();

    await this.pxe.registerAccount(this.secretKey, completeAddress.partialAddress);

    const { constructorName, constructorArgs } = (await this.accountContract.getInitializationFunctionAndArgs()) ?? {
      constructorName: undefined,
      constructorArgs: undefined,
    };

    return new DeployMethod(
      this.getPublicKeys(),
      this.wallet,
      artifact,
      address => Contract.at(address, artifact, this.wallet),
      constructorArgs,
      constructorName,
    );
  }

  /**
   * Returns a FeePaymentMethod that routes the original one provided as an argument
   * through the account's entrypoint. This allows an account contract to pay
   * for its own deployment and initialization.
   *
   * For more details on how the fee payment routing works see documentation of AccountEntrypointMetaPaymentMethod class.
   *
   * @param originalPaymentMethod - originalPaymentMethod The original payment method to be wrapped.
   * @returns A FeePaymentMethod that routes the original one through the account's entrypoint (AccountEntrypointMetaPaymentMethod)
   */
  public async getSelfPaymentMethod(originalPaymentMethod?: FeePaymentMethod) {
    const artifact = await this.accountContract.getContractArtifact();
    const account = await this.getAccount();
    const address = account.getAddress();
    return new AccountEntrypointMetaPaymentMethod(
      artifact,
      account,
      'entrypoint',
      address,
      originalPaymentMethod ?? new FeeJuicePaymentMethod(address),
    );
  }

  /**
   * Submits a tx to initialize and/or publish this account's account contract
   * (depending on the contract's design).
   * Doesn't necessarily publish the class nor publish the instance.
   * Uses the salt provided in the constructor or a randomly generated one.
   * Adds the account to the PXE Service first.
   * @param opts - Fee options to be used for the deployment.
   * @returns A SentTx object that can be waited to get the associated Wallet.
   */
  public deploy(opts?: DeployAccountOptions): DeployAccountSentTx {
    const sendTx = async () => {
      const deployMethod = await this.getDeployMethod();
      let fee = opts?.fee;
      if (!opts?.deployAccount) {
        const wrappedPaymentMethod = await this.getSelfPaymentMethod(opts?.fee?.paymentMethod);
        fee = { ...fee, paymentMethod: wrappedPaymentMethod };
      }

      const tx = deployMethod.send({
        from: opts?.deployAccount ?? AztecAddress.ZERO,
        contractAddressSalt: new Fr(this.salt),
        skipClassPublication: opts?.skipClassPublication ?? true,
        skipInstancePublication: opts?.skipInstancePublication ?? true,
        skipInitialization: opts?.skipInitialization ?? false,
        universalDeploy: true,
        fee,
      });
      return tx.getTxHash();
    };
    return new DeployAccountSentTx(this.wallet, sendTx, this.getAccount());
  }

  /**
   * Deploys the account contract that backs this account if needed and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one. If no initialization
   * is required it skips the transaction, and only registers the account in the PXE Service.
   * @param opts - Options to wait for the tx to be mined.
   * @returns An Account instance.
   */
  public async waitSetup(opts: DeployAccountOptions & WaitOpts = DefaultWaitOpts): Promise<AccountWithSecretKey> {
    await ((await this.hasInitializer()) ? this.deploy(opts).wait(opts) : this.register());
    return this.getAccount();
  }

  /**
   * Returns whether this account contract has an initializer function.
   */
  public async hasInitializer() {
    return (await this.accountContract.getInitializationFunctionAndArgs()) !== undefined;
  }
}
