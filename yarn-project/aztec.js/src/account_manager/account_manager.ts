import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import { Fr } from '@aztec/foundation/fields';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { Account } from '../account/account.js';
import type { AccountContract } from '../account/account_contract.js';
import { AccountWithSecretKey } from '../account/account_with_secret_key.js';
import type { Salt } from '../account/index.js';
import type { AccountInterface } from '../account/interface.js';
import { SignerlessAccount } from '../account/signerless_account.js';
import { Contract } from '../contract/contract.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import { DefaultWaitOpts, type WaitOpts } from '../contract/sent_tx.js';
import { AccountEntrypointMetaPaymentMethod } from '../fee/account_entrypoint_meta_payment_method.js';
import { FeeJuicePaymentMethod, type FeePaymentMethod, type Wallet } from '../index.js';
import { BaseWallet } from '../wallet/base_wallet.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';

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
  deployAccount?: Account;
};

/**
 * Manages a user account. Provides methods for calculating the account's address, deploying the account contract,
 * and creating and registering the user wallet in the PXE Service.
 */
export class AccountManager {
  private deployWallet: Wallet;

  private constructor(
    private pxe: PXE,
    private secretKey: Fr,
    private accountContract: AccountContract,
    private instance: ContractInstanceWithAddress,
    /**
     * Contract instantiation salt for the account contract
     */
    public readonly salt: Salt,
  ) {
    this.deployWallet = new BaseWallet(pxe);
  }

  static async create(pxe: PXE, secretKey: Fr, accountContract: AccountContract, salt?: Salt) {
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

    return new AccountManager(pxe, secretKey, accountContract, instance, salt);
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
    const nodeInfo = await this.pxe.getNodeInfo();
    const completeAddress = await this.getCompleteAddress();
    return this.accountContract.getInterface(completeAddress, nodeInfo);
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
    const entrypoint = await this.getAccount();
    return new AccountWithSecretKey(entrypoint, this.secretKey, this.salt);
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
  public async getDeployMethod(deployAccount?: Account): Promise<DeployMethod> {
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

    if (deployAccount) {
      // If deploying using an existing wallet/account, treat it like regular contract deployment.
      const thisAccount = await this.getAccount();
      return new DeployMethod(
        this.getPublicKeys(),
        this.deployWallet,
        thisAccount,
        artifact,
        address => Contract.at(address, artifact, this.deployWallet),
        constructorArgs,
        constructorName,
      );
    }

    const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
    // We use a signerless wallet with the multi call entrypoint in order to make multiple calls in one go.
    // If we used getWallet, the deployment would get routed via the account contract entrypoint
    // and it can't be used unless the contract is initialized.
    const account = new SignerlessAccount(new DefaultMultiCallEntrypoint(chainId, rollupVersion));

    return new DeployMethod(
      this.getPublicKeys(),
      this.deployWallet,
      account,
      artifact,
      address => Contract.at(address, artifact, this.deployWallet),
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
    let deployMethod: DeployMethod;
    const sendTx = () =>
      this.getDeployMethod(opts?.deployAccount)
        .then(method => {
          deployMethod = method;
          if (!opts?.deployAccount && opts?.fee) {
            return this.getSelfPaymentMethod(opts?.fee?.paymentMethod);
          }
        })
        .then(maybeWrappedPaymentMethod => {
          let fee = opts?.fee;
          if (maybeWrappedPaymentMethod) {
            fee = { ...opts?.fee, paymentMethod: maybeWrappedPaymentMethod };
          }
          return deployMethod.send({
            contractAddressSalt: new Fr(this.salt),
            skipClassPublication: opts?.skipClassPublication ?? true,
            skipInstancePublication: opts?.skipInstancePublication ?? true,
            skipInitialization: opts?.skipInitialization ?? false,
            universalDeploy: true,
            fee,
          });
        })
        .then(tx => tx.getTxHash());
    return new DeployAccountSentTx(this.pxe, sendTx, this.getAccount());
  }

  /**
   * Deploys the account contract that backs this account if needed and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one. If no initialization
   * is required it skips the transaction, and only registers the account in the PXE Service.
   * @param opts - Options to wait for the tx to be mined.
   * @returns A Wallet instance.
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
