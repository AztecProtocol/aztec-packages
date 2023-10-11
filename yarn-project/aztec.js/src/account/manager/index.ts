import { PublicKey, getContractDeploymentInfo } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { CompleteAddress, GrumpkinPrivateKey, PXE } from '@aztec/types';

import {
  AccountWalletWithPrivateKey,
  ContractDeployer,
  DeployMethod,
  WaitOpts,
  generatePublicKey,
} from '../../index.js';
import { AccountContract, Salt } from '../index.js';
import { AccountInterface } from '../interface.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';

/**
 * Manages a user account. Provides methods for calculating the account's address, deploying the account contract,
 * and creating and registering the user wallet in the PXE Service.
 */
export class AccountManager {
  /** Deployment salt for the account contract. */
  public readonly salt?: Fr;

  private completeAddress?: CompleteAddress;
  private encryptionPublicKey?: PublicKey;
  private deployMethod?: DeployMethod;

  constructor(
    private pxe: PXE,
    private encryptionPrivateKey: GrumpkinPrivateKey,
    private accountContract: AccountContract,
    saltOrAddress?: Salt | CompleteAddress,
  ) {
    if (saltOrAddress instanceof CompleteAddress) {
      this.completeAddress = saltOrAddress;
    } else {
      this.salt = saltOrAddress ? new Fr(saltOrAddress) : Fr.random();
    }
  }

  protected async getEncryptionPublicKey() {
    if (!this.encryptionPublicKey) {
      this.encryptionPublicKey = await generatePublicKey(this.encryptionPrivateKey);
    }
    return this.encryptionPublicKey;
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
  public async getCompleteAddress(): Promise<CompleteAddress> {
    if (!this.completeAddress) {
      const encryptionPublicKey = await generatePublicKey(this.encryptionPrivateKey);
      const contractDeploymentInfo = await getContractDeploymentInfo(
        this.accountContract.getContractArtifact(),
        await this.accountContract.getDeploymentArgs(),
        this.salt!,
        encryptionPublicKey,
      );
      this.completeAddress = contractDeploymentInfo.completeAddress;
    }
    return this.completeAddress;
  }

  /**
   * Returns a Wallet instance associated with this account. Use it to create Contract
   * instances to be interacted with from this account.
   * @returns A Wallet instance.
   */
  public async getWallet(): Promise<AccountWalletWithPrivateKey> {
    const entrypoint = await this.getAccount();
    return new AccountWalletWithPrivateKey(this.pxe, entrypoint, this.encryptionPrivateKey);
  }

  /**
   * Registers this account in the PXE Service and returns the associated wallet. Registering
   * the account on the PXE Service is required for managing private state associated with it.
   * Use the returned wallet to create Contract instances to be interacted with from this account.
   * @returns A Wallet instance.
   */
  public async register(): Promise<AccountWalletWithPrivateKey> {
    const completeAddress = await this.getCompleteAddress();
    await this.pxe.registerAccount(this.encryptionPrivateKey, completeAddress.partialAddress);
    return this.getWallet();
  }

  /**
   * Returns the pre-populated deployment method to deploy the account contract that backs this account.
   * Typically you will not need this method and can call `deploy` directly. Use this for having finer
   * grained control on when to create, simulate, and send the deployment tx.
   * @returns A DeployMethod instance that deploys this account contract.
   */
  public async getDeployMethod() {
    if (!this.deployMethod) {
      if (!this.salt) throw new Error(`Cannot deploy account contract without known salt.`);
      await this.register();
      const encryptionPublicKey = await this.getEncryptionPublicKey();
      const deployer = new ContractDeployer(this.accountContract.getContractArtifact(), this.pxe, encryptionPublicKey);
      const args = await this.accountContract.getDeploymentArgs();
      this.deployMethod = deployer.deploy(...args);
    }
    return this.deployMethod;
  }

  /**
   * Deploys the account contract that backs this account.
   * Uses the salt provided in the constructor or a randomly generated one.
   * Note that if the Account is constructed with an explicit complete address
   * it is assumed that the account contract has already been deployed and this method will throw.
   * Registers the account in the PXE Service before deploying the contract.
   * @returns A SentTx object that can be waited to get the associated Wallet.
   */
  public async deploy(): Promise<DeployAccountSentTx> {
    const deployMethod = await this.getDeployMethod();
    const wallet = await this.getWallet();
    const sentTx = deployMethod.send({ contractAddressSalt: this.salt });
    return new DeployAccountSentTx(wallet, sentTx.getTxHash());
  }

  /**
   * Deploys the account contract that backs this account and awaits the tx to be mined.
   * Uses the salt provided in the constructor or a randomly generated one.
   * Note that if the Account is constructed with an explicit complete address
   * it is assumed that the account contract has already been deployed and this method will throw.
   * Registers the account in the PXE Service before deploying the contract.
   * @param opts - Options to wait for the tx to be mined.
   * @returns A Wallet instance.
   */
  public async waitDeploy(opts: WaitOpts = {}): Promise<AccountWalletWithPrivateKey> {
    await this.deploy().then(tx => tx.wait(opts));
    return this.getWallet();
  }
}
