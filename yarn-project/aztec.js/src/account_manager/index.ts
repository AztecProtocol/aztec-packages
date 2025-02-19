import { CompleteAddress, type PXE } from '@aztec/circuit-types';
import { type ContractInstanceWithAddress, deriveKeys, getContractInstanceFromDeployParams } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { type AccountContract } from '../account/contract.js';
import { type Salt, type Wallet } from '../account/index.js';
import { type AccountInterface } from '../account/interface.js';
import { DeployMethod, type DeployOptions } from '../contract/deploy_method.js';
import { Contract } from '../contract/index.js';
import { DefaultWaitOpts, type WaitOpts } from '../contract/sent_tx.js';
import { DefaultMultiCallEntrypoint } from '../entrypoint/default_multi_call_entrypoint.js';
import { AccountWalletWithSecretKey, SignerlessWallet } from '../wallet/index.js';
import { DeployAccountMethod } from './deploy_account_method.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';

/**
 * Options to deploy an account contract.
 */
export type DeployAccountOptions = Pick<
  DeployOptions,
  'fee' | 'skipClassRegistration' | 'skipPublicDeployment' | 'skipInitialization'
> & {
  /**
   * Wallet used for deploying the account contract. Must be funded in order to pay for the fee.
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
     * Deployment salt for the account contract
     */
    public readonly salt: Salt,
  ) {}

  static async create(pxe: PXE, secretKey: Fr, accountContract: AccountContract, salt?: Salt) {
    const { publicKeys } = await deriveKeys(secretKey);
    salt = salt !== undefined ? new Fr(salt) : Fr.random();

    const instance = await getContractInstanceFromDeployParams(accountContract.getContractArtifact(), {
      constructorArgs: await accountContract.getDeploymentArgs(),
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
   * Does not require the account to be deployed or registered.
   * @returns The address, partial address, and encryption public key.
   */
  public getCompleteAddress(): Promise<CompleteAddress> {
    return CompleteAddress.fromSecretKeyAndInstance(this.secretKey, this.instance);
  }

  /**
   * Gets the address for this given account.
   * Does not require the account to be deployed or registered.
   * @returns The address.
   */
  public getAddress() {
    return this.instance.address;
  }

  /**
   * Returns the contract instance definition associated with this account.
   * Does not require the account to be deployed or registered.
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
   * Registers this account in the PXE Service and returns the associated wallet. Registering
   * the account on the PXE Service is required for managing private state associated with it.
   * Use the returned wallet to create Contract instances to be interacted with from this account.
   * @param opts - Options to wait for the account to be synched.
   * @returns A Wallet instance.
   */
  public async register(): Promise<AccountWalletWithSecretKey> {
    await this.pxe.registerContract({
      artifact: this.accountContract.getContractArtifact(),
      instance: this.getInstance(),
    });

    await this.pxe.registerAccount(this.secretKey, (await this.getCompleteAddress()).partialAddress);

    return this.getWallet();
  }

  /**
   * Returns the pre-populated deployment method to deploy the account contract that backs this account.
   * Typically you will not need this method and can call `deploy` directly. Use this for having finer
   * grained control on when to create, simulate, and send the deployment tx.
   * @param deployWallet - Wallet used for deploying the account contract.
   * @returns A DeployMethod instance that deploys this account contract.
   */
  public async getDeployMethod(deployWallet?: Wallet) {
    if (!(await this.isDeployable())) {
      throw new Error(
        `Account contract ${this.accountContract.getContractArtifact().name} does not require deployment.`,
      );
    }

    const completeAddress = await this.getCompleteAddress();

    await this.pxe.registerAccount(this.secretKey, completeAddress.partialAddress);

    const artifact = this.accountContract.getContractArtifact();

    const args = (await this.accountContract.getDeploymentArgs()) ?? [];

    if (deployWallet) {
      // If deploying using an existing wallet/account, treat it like regular contract deployment.
      const thisWallet = await this.getWallet();
      return new DeployMethod(
        this.getPublicKeys(),
        deployWallet,
        artifact,
        address => Contract.at(address, artifact, thisWallet),
        args,
        'constructor',
      );
    }

    const { l1ChainId: chainId, protocolVersion } = await this.pxe.getNodeInfo();
    // We use a signerless wallet with the multi call entrypoint in order to make multiple calls in one go.
    // If we used getWallet, the deployment would get routed via the account contract entrypoint
    // and it can't be used unless the contract is initialized.
    const wallet = new SignerlessWallet(this.pxe, new DefaultMultiCallEntrypoint(chainId, protocolVersion));

    return new DeployAccountMethod(
      this.accountContract.getAuthWitnessProvider(completeAddress),
      this.getPublicKeys(),
      wallet,
      artifact,
      args,
      'constructor',
      'entrypoint',
    );
  }

  /**
   * Deploys the account contract that backs this account.
   * Does not register the associated class nor publicly deploy the instance by default.
   * Uses the salt provided in the constructor or a randomly generated one.
   * Registers the account in the PXE Service before deploying the contract.
   * @param opts - Fee options to be used for the deployment.
   * @returns A SentTx object that can be waited to get the associated Wallet.
   */
  public deploy(opts?: DeployAccountOptions): DeployAccountSentTx {
    const sentTx = this.getDeployMethod(opts?.deployWallet)
      .then(deployMethod =>
        deployMethod.send({
          contractAddressSalt: new Fr(this.salt),
          skipClassRegistration: opts?.skipClassRegistration ?? true,
          skipPublicDeployment: opts?.skipPublicDeployment ?? true,
          skipInitialization: opts?.skipInitialization ?? false,
          universalDeploy: true,
          fee: opts?.fee,
        }),
      )
      .then(tx => tx.getTxHash());
    return new DeployAccountSentTx(this.pxe, sentTx, this.getWallet());
  }

  /**
   * Deploys the account contract that backs this account if needed and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one. If no initialization
   * is required it skips the transaction, and only registers the account in the PXE Service.
   * @param opts - Options to wait for the tx to be mined.
   * @returns A Wallet instance.
   */
  public async waitSetup(opts: DeployAccountOptions & WaitOpts = DefaultWaitOpts): Promise<AccountWalletWithSecretKey> {
    await ((await this.isDeployable()) ? this.deploy(opts).wait(opts) : this.register());
    return this.getWallet();
  }

  /**
   * Returns whether this account contract has a constructor and needs deployment.
   */
  public async isDeployable() {
    return (await this.accountContract.getDeploymentArgs()) !== undefined;
  }
}
