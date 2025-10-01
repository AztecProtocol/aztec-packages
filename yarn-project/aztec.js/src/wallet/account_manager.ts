import { Fr } from '@aztec/foundation/fields';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountContract } from '../account/account_contract.js';
import { AccountWithSecretKey } from '../account/account_with_secret_key.js';
import type { Salt } from '../account/index.js';
import type { AccountInterface } from '../account/interface.js';
import { Contract } from '../contract/contract.js';
import { DeployAccountMethod } from './deploy_account_method.js';
import type { Wallet } from './wallet.js';

/**
 * Manages a user account. Provides methods for calculating the account's address and other related data,
 * plus a helper to return a preconfigured deploy method.
 */
export class AccountManager {
  private constructor(
    private wallet: Wallet,
    private secretKey: Fr,
    private accountContract: AccountContract,
    private instance: ContractInstanceWithAddress,
    /**
     * Contract instantiation salt for the account contract
     */
    public readonly salt: Salt,
  ) {}

  static async create(wallet: Wallet, secretKey: Fr, accountContract: AccountContract, salt?: Salt) {
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

    return new AccountManager(wallet, secretKey, accountContract, instance, salt);
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
   * Returns the secret key used to derive the rest of the privacy keys for this contract
   */
  public getSecretKey() {
    return this.secretKey;
  }

  get address() {
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
   * Returns a preconfigured deploy method that contains all the necessary function
   * calls to deploy the account contract.
   */
  public async getDeployMethod(): Promise<DeployAccountMethod> {
    const artifact = await this.accountContract.getContractArtifact();

    if (!(await this.hasInitializer())) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/15576):
      // there should be a path which enables an account contract's class & instance to be published,
      // even if the account contract doesn't have an initializer function. This should not throw.
      throw new Error(`Account contract ${artifact.name} does not have an initializer function to call.`);
    }

    const { constructorName, constructorArgs } = (await this.accountContract.getInitializationFunctionAndArgs()) ?? {
      constructorName: undefined,
      constructorArgs: undefined,
    };

    return new DeployAccountMethod(
      this.getPublicKeys(),
      this.wallet,
      artifact,
      address => Contract.at(address, artifact, this.wallet),
      new Fr(this.salt),
      constructorArgs,
      constructorName,
    );
  }

  /**
   * Returns whether this account contract has an initializer function.
   */
  public async hasInitializer() {
    return (await this.accountContract.getInitializationFunctionAndArgs()) !== undefined;
  }
}
