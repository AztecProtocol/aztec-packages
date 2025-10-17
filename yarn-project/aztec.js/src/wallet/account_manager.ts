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
 * Manages the lifecycle and configuration of an Aztec account contract.
 *
 * @remarks
 * AccountManager provides a high-level interface for working with Aztec account contracts,
 * which implement account abstraction on the Aztec network. It handles:
 * - Address derivation from secret keys and public keys
 * - Account contract deployment preparation
 * - Account interface creation for transaction signing
 * - Contract instance management
 *
 * Account contracts in Aztec are fully programmable and can implement custom authentication
 * logic, transaction validation, and fee payment strategies. The AccountManager abstracts
 * away the complexity of managing these contracts.
 *
 * @example
 * ```typescript
 * // Create an account manager
 * const secretKey = Fr.random();
 * const accountContract = new SchnorrAccountContract();
 * const manager = await AccountManager.create(
 *   wallet,
 *   secretKey,
 *   accountContract
 * );
 *
 * console.log('Account address:', manager.address.toString());
 *
 * // Deploy the account
 * const deployMethod = await manager.getDeployMethod();
 * const tx = deployMethod.send({ from: wallet.getAddress() });
 * await tx.deployed();
 *
 * // Get the account for signing transactions
 * const account = await manager.getAccount();
 * ```
 *
 * @example
 * ```typescript
 * // Create account with deterministic salt
 * const salt = new Fr(12345);
 * const manager = await AccountManager.create(
 *   wallet,
 *   secretKey,
 *   accountContract,
 *   salt
 * );
 *
 * // Get complete address including public keys
 * const completeAddress = await manager.getCompleteAddress();
 * console.log('Address:', completeAddress.address);
 * console.log('Public keys:', completeAddress.publicKeys);
 * ```
 *
 * @example
 * ```typescript
 * // Use with custom account contract
 * class MyCustomAccountContract implements AccountContract {
 *   // ... custom authentication logic
 * }
 *
 * const customAccount = new MyCustomAccountContract();
 * const manager = await AccountManager.create(
 *   wallet,
 *   secretKey,
 *   customAccount
 * );
 * ```
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

  /**
   * Creates a new AccountManager instance.
   *
   * @remarks
   * This factory method initializes an AccountManager by deriving public keys from the secret key,
   * creating the contract instance, and configuring the account contract. The resulting manager
   * can be used to deploy the account or create an account interface for signing transactions.
   *
   * @param wallet - The wallet to use for deployment and contract interactions
   * @param secretKey - The secret key used to derive account keys and sign transactions
   * @param accountContract - The account contract implementation defining authentication logic
   * @param salt - Optional salt for deterministic address derivation. If not provided, a random salt is used.
   * @returns A configured AccountManager instance
   *
   * @example
   * ```typescript
   * const manager = await AccountManager.create(
   *   wallet,
   *   Fr.random(),
   *   new SchnorrAccountContract()
   * );
   * ```
   */
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
   * Gets the complete address for this account including all derived keys.
   *
   * @remarks
   * The complete address contains:
   * - The account contract address
   * - The partial address (derived from public keys and contract data)
   * - Public keys for encryption and nullifier derivation
   *
   * This method does not require the account to be deployed on-chain. The address is
   * deterministically computed from the secret key, contract artifact, and salt.
   *
   * @returns The complete address with all associated public keys
   *
   * @example
   * ```typescript
   * const completeAddress = await manager.getCompleteAddress();
   * console.log('Account address:', completeAddress.address.toString());
   * console.log('Public keys hash:', completeAddress.publicKeys.hash().toString());
   * ```
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
   * Creates an Account instance that can be used to sign and send transactions.
   *
   * @remarks
   * The returned Account combines the account interface (for transaction creation and signing)
   * with the secret key (for authentication). It can be used with a wallet to send transactions
   * from this account.
   *
   * This method does not deploy the account - it only creates a local interface. To deploy
   * the account contract on-chain, use `getDeployMethod()`.
   *
   * @returns An Account instance for signing transactions
   *
   * @example
   * ```typescript
   * const account = await manager.getAccount();
   * const wallet = await PXE.registerAccount(account);
   *
   * // Now use the wallet to interact with contracts
   * const contract = await Contract.at(contractAddress, artifact, wallet);
   * await contract.methods.transfer(recipient, amount).send().wait();
   * ```
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
   * Creates a DeployAccountMethod for deploying this account contract to the network.
   *
   * @remarks
   * The returned DeployAccountMethod is preconfigured with the account's initialization
   * parameters and can be sent to deploy the account on-chain. Account deployment typically
   * involves:
   * 1. Publishing the account contract class (if not already published)
   * 2. Publishing the account instance
   * 3. Calling the account's initialization function (constructor)
   *
   * Account contracts can optionally pay for their own deployment fees using the account's
   * entrypoint, which is useful for sponsored account creation.
   *
   * @returns A configured DeployAccountMethod ready to be sent
   *
   * @throws Will throw if the account contract has no initializer function
   *
   * @example
   * ```typescript
   * const deployMethod = await manager.getDeployMethod();
   * const tx = deployMethod.send({ from: deployerAddress });
   * const receipt = await tx.wait();
   * console.log('Account deployed at:', receipt.contract.address);
   * ```
   *
   * @example
   * ```typescript
   * // Self-paying deployment (account pays for its own deployment)
   * const deployMethod = await manager.getDeployMethod();
   * const tx = deployMethod.send({
   *   from: manager.address, // Account deploying itself
   *   fee: { paymentMethod: new FeeJuicePaymentMethod(manager.address) }
   * });
   * ```
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
