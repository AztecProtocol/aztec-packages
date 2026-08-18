import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { deriveKeys } from '@aztec/stdlib/keys';

import type { AccountContract } from '../account/account_contract.js';
import type { Account, Salt } from '../account/index.js';
import { Contract } from '../contract/contract.js';
import { DeployAccountMethod } from './deploy_account_method.js';
import type { Wallet } from './wallet.js';

/**
 * Optional overrides passed to {@link AccountManager.create}.
 */
export interface AccountManagerCreateOptions {
  /** Contract instantiation salt. Defaults to a random `Fr`. */
  salt?: Salt;
  /**
   * Commitment to the contract's immutable storage values. Folded into the salted initialization
   * hash, so a non-zero value affects the derived address. Defaults to `Fr.ZERO`.
   */
  immutablesHash?: Fr;
  /** Address recorded as the instance deployer. Defaults to `AztecAddress.ZERO`. */
  deployer?: AztecAddress;
}

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
  ) {}

  static async create(
    wallet: Wallet,
    secretKey: Fr,
    accountContract: AccountContract,
    opts?: AccountManagerCreateOptions,
  ) {
    const { publicKeys } = await deriveKeys(secretKey);
    const salt = opts?.salt !== undefined ? new Fr(opts.salt) : Fr.random();

    const { constructorName, constructorArgs } = (await accountContract.getInitializationFunctionAndArgs()) ?? {
      constructorName: undefined,
      constructorArgs: undefined,
    };

    const artifact = await accountContract.getContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(artifact, {
      constructorArtifact: constructorName,
      constructorArgs,
      salt,
      publicKeys,
      deployer: opts?.deployer,
      immutablesHash: opts?.immutablesHash ?? (await accountContract.getImmutablesHash()),
    });

    return new AccountManager(wallet, secretKey, accountContract, instance);
  }

  protected getPublicKeys(): PublicKeys {
    return this.instance.publicKeys;
  }

  protected getPublicKeysHash(): Promise<Fr> {
    return this.getPublicKeys().hash();
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

  get address(): AztecAddress {
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
   * Returns the account (the transaction signer) backed by this account contract. Use it to build and authorize
   * transactions from this account.
   */
  public async getAccount(): Promise<Account> {
    const completeAddress = await this.getCompleteAddress();
    return this.accountContract.getAccount(completeAddress);
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

    const account = await this.getAccount();
    return new DeployAccountMethod(
      this.getPublicKeys(),
      this.wallet,
      artifact,
      instance => Contract.at(instance.address, artifact, this.wallet),
      this.instance.salt,
      this.instance.immutablesHash,
      account,
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
