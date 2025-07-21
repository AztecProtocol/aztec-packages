import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import { Fr } from '@aztec/foundation/fields';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountContract } from '../account/account_contract.js';
import type { Salt } from '../account/index.js';
import type { AccountInterface } from '../account/interface.js';
import { Contract } from '../contract/contract.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import { DefaultWaitOpts, type WaitOpts } from '../contract/sent_tx.js';
import { AccountEntrypointMetaPaymentMethod } from '../fee/account_entrypoint_meta_payment_method.js';
import { FeeJuicePaymentMethod, type FeePaymentMethod } from '../index.js';
import { AccountWalletWithSecretKey, SignerlessWallet, type Wallet } from '../wallet/index.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';

/**
 * Options to deploy an account contract.
 */
export type DeployAccountOptions = Pick<
  DeployOptions,
  'fee' | 'skipClassPublication' | 'skipInstancePublication' | 'skipInitialization'
> & {
  /**
   * Wallet used for any txs to initialize and/or publish the account contract. Must be funded in order to pay for the fee.
   */
  deployWallet?: Wallet;
};

/**
 * Manages a user account. Provides methods for calculating the account's address, deploying the account contract,
 * and creating and registering the user wallet in the PXE Service.
 */
export class AccountManager {
  private constructor(
    private pxe: PXE,
    private secretKey: Fr,
    private accountContract: AccountContract,
    private instance: ContractInstanceWithAddress,
    /**
     * Contract instantiation salt for the account contract
     */
    public readonly salt: Salt,
  ) {}

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
  public async getAccount(): Promise<AccountInterface> {
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
  public async getWallet(): Promise<AccountWalletWithSecretKey> {
    const entrypoint = await this.getAccount();
    return new AccountWalletWithSecretKey(this.pxe, entrypoint, this.secretKey, this.salt);
  }

  /**
   * Add this account in the PXE Service and returns the associated wallet. Adding
   * the account to the PXE Service is required for managing private state associated with it.
   * Use the returned wallet to create Contract instances to be interacted with from this account.
   * @param opts - Options to wait for the account to be synched.
   * @returns A Wallet instance.
   */
  public async register(): Promise<AccountWalletWithSecretKey> {
    await this.pxe.registerContract({
      artifact: await this.accountContract.getContractArtifact(),
      instance: this.getInstance(),
    });

    await this.pxe.registerAccount(this.secretKey, (await this.getCompleteAddress()).partialAddress);

    return this.getWallet();
  }

  /**
   * Returns the pre-populated ContractSetupMethods which can prepare a tx to
   * initialize and/or publish this account's account contract (depending on the contract's design).
   * If no wallet is provided, it uses a signerless wallet with the multi call entrypoint
   * @param deployWallet - Wallet used for any txs that are needed to
   * set up the account contract for use.
   * @returns A ContractSetupMethods instance that can set up this account contract for use
   */
  public async getDeployMethod(deployWallet?: Wallet): Promise<DeployMethod> {
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

    if (deployWallet) {
      // If deploying using an existing wallet/account, treat it like regular contract deployment.
      const thisWallet = await this.getWallet();
      return new DeployMethod(
        this.getPublicKeys(),
        deployWallet,
        artifact,
        address => Contract.at(address, artifact, thisWallet),
        constructorArgs,
        constructorName,
      );
    }

    const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
    // We use a signerless wallet with the multi call entrypoint in order to make multiple calls in one go.
    // If we used getWallet, the deployment would get routed via the account contract entrypoint
    // and it can't be used unless the contract is initialized.
    const wallet = new SignerlessWallet(this.pxe, new DefaultMultiCallEntrypoint(chainId, rollupVersion));

    return new DeployMethod(
      this.getPublicKeys(),
      wallet,
      artifact,
      address => Contract.at(address, artifact, wallet),
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
    const wallet = await this.getWallet();
    const address = wallet.getAddress();
    return new AccountEntrypointMetaPaymentMethod(
      artifact,
      wallet,
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
      this.getDeployMethod(opts?.deployWallet)
        .then(method => {
          deployMethod = method;
          if (!opts?.deployWallet && opts?.fee) {
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
    return new DeployAccountSentTx(this.pxe, sendTx, this.getWallet());
  }

  /**
   * Deploys the account contract that backs this account if needed and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one. If no initialization
   * is required it skips the transaction, and only registers the account in the PXE Service.
   * @param opts - Options to wait for the tx to be mined.
   * @returns A Wallet instance.
   */
  public async waitSetup(opts: DeployAccountOptions & WaitOpts = DefaultWaitOpts): Promise<AccountWalletWithSecretKey> {
    await ((await this.hasInitializer()) ? this.deploy(opts).wait(opts) : this.register());
    return this.getWallet();
  }

  /**
   * Returns whether this account contract has an initializer function.
   */
  public async hasInitializer() {
    return (await this.accountContract.getInitializationFunctionAndArgs()) !== undefined;
  }
}
