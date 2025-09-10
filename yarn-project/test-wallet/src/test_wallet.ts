import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import {
  type Account,
  type AccountContract,
  AccountManager,
  BaseAccount,
  BaseWallet,
  type IntentAction,
  type IntentInnerHash,
  SignerlessAccount,
  type SimulateMethodOptions,
} from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fq, Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

/**
 * Data for generating an account.
 */
export interface AccountData {
  /**
   * Secret to derive the keys for the account.
   */
  secret: Fr;
  /**
   * Contract address salt.
   */
  salt: Fr;
  /**
   * Contract that backs the account.
   */
  contract: AccountContract;
}

/**
 * Wallet implementation that stores accounts in memory and allows allows their creation
 * from the outside (which is something actual wallets shouldn't allow!)
 * It is intended to be used in e2e tests.
 */
export class TestWallet extends BaseWallet {
  protected accounts: Map<string, Account> = new Map();

  private simulatedSimulations = false;

  enableSimulatedSimulations() {
    this.simulatedSimulations = true;
  }

  disableSimulatedSimulations() {
    this.simulatedSimulations = false;
  }

  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
      account = new SignerlessAccount(new DefaultMultiCallEntrypoint(chainId, rollupVersion));
    } else {
      account = this.accounts.get(address?.toString() ?? '');
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  async createAccount(accountData: AccountData): Promise<AccountManager> {
    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      accountData.secret,
      accountData.contract,
      accountData.salt,
    );

    await accountManager.register();

    this.accounts.set(accountManager.getAddress().toString(), await accountManager.getAccount());

    return accountManager;
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager> {
    signingKey = signingKey ?? deriveSigningKey(secret);
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaRAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaKAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  async lookupValidity(address: AztecAddress, intent: IntentInnerHash | IntentAction, witness: AuthWitness) {
    const account = (await this.getAccountFromAddress(address)) as BaseAccount;
    return account.lookupValidity(this, address, intent, witness);
  }

  private async getFakeAccountDataFor(address: AztecAddress) {
    const nodeInfo = await this.pxe.getNodeInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress, nodeInfo);
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {});
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateMethodOptions,
  ): Promise<TxSimulationResult> {
    if (!this.simulatedSimulations) {
      return super.simulateTx(executionPayload, opts);
    } else {
      const executionOptions = { txNonce: Fr.random(), cancellable: false };
      const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
      const fee = await this.getFeeOptions(fromAccount, executionPayload, opts.fee, executionOptions);
      const txRequest = await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      return this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, { contracts: contractOverrides });
    }
  }
}
