import { type Account, SignerlessAccount } from '@aztec/aztec.js/account';
import type { Aliased } from '@aztec/aztec.js/wallet';
import { AccountManager } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { AccessScopes, PXEConfig, PXECreationOptions } from '@aztec/pxe/client/lazy';
import type { PXE } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  ExecutionPayload,
  SimulationOverrides,
  type TxSimulationResult,
  mergeExecutionPayloads,
} from '@aztec/stdlib/tx';
import { BaseWallet, type FeeOptions } from '@aztec/wallet-sdk/base-wallet';

import type { AccountContractsProvider } from './account-contract-providers/types.js';
import { type AccountType, WalletDB } from './wallet_db.js';

export type EmbeddedWalletOptions = {
  /** Parent logger. Child loggers are derived via createChild() for each subsystem. */
  logger?: Logger;
  /** Use ephemeral (in-memory) stores. Data will not persist across sessions. */
  ephemeral?: boolean;
  /** Override PXE configuration. */
  pxeConfig?: Partial<PXEConfig>;
  /** Advanced PXE creation options (custom store, prover, simulator). */
  pxeOptions?: PXECreationOptions;
};

export class EmbeddedWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    aztecNode: AztecNode,
    protected walletDB: WalletDB,
    protected accountContracts: AccountContractsProvider,
    log?: Logger,
  ) {
    super(pxe, aztecNode, log);
  }

  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    if (address.equals(AztecAddress.ZERO)) {
      return new SignerlessAccount();
    }

    const { secretKey, salt, signingKey, type } = await this.walletDB.retrieveAccount(address);
    const accountManager = await this.createAccountInternal(type, secretKey, salt, signingKey);
    const account = await accountManager.getAccount();

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return this.walletDB.listAccounts();
  }

  override async registerSender(address: AztecAddress, alias: string) {
    await this.walletDB.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    const senders = await this.pxe.getSenders();
    const storedSenders = await this.walletDB.listSenders();
    for (const storedSender of storedSenders) {
      if (senders.findIndex(sender => sender.equals(storedSender.item)) === -1) {
        await this.pxe.registerSender(storedSender.item);
      }
    }
    return storedSenders;
  }

  /**
   * Simulates calls via a stub account entrypoint, bypassing real account authorization.
   * This allows kernelless simulation with contract overrides, skipping expensive
   * private kernel circuit execution.
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
    scopes: AccessScopes,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ): Promise<TxSimulationResult> {
    let overrides: SimulationOverrides | undefined;
    let fromAccount: Account;
    if (!from.equals(AztecAddress.ZERO)) {
      const { account, instance, artifact } = await this.getFakeAccountDataFor(from);
      fromAccount = account;
      overrides = {
        contracts: { [from.toString()]: { instance, artifact } },
      };
    } else {
      fromAccount = await this.getAccountFromAddress(from);
    }

    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
    return this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipFeeEnforcement,
      skipTxValidation,
      overrides,
      scopes,
    });
  }

  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(`Cannot create fake account data for SignerlessAccount at address: ${address}`);
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = await this.accountContracts.createStubAccount(originalAddress);
    const stubArtifact = await this.accountContracts.getStubAccountContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(stubArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: stubArtifact,
    };
  }

  protected async createAccountInternal(
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer,
  ): Promise<AccountManager> {
    let contract;
    switch (type) {
      case 'schnorr': {
        contract = await this.accountContracts.getSchnorrAccountContract(Fq.fromBuffer(signingKey));
        break;
      }
      case 'ecdsasecp256k1': {
        contract = await this.accountContracts.getEcdsaKAccountContract(signingKey);
        break;
      }
      case 'ecdsasecp256r1': {
        contract = await this.accountContracts.getEcdsaRAccountContract(signingKey);
        break;
      }
      default: {
        throw new Error(`Unknown account type ${type}`);
      }
    }

    const accountManager = await AccountManager.create(this, secret, contract, salt);

    const instance = accountManager.getInstance();
    const existingInstance = await this.pxe.getContractInstance(instance.address);
    if (!existingInstance) {
      const existingArtifact = await this.pxe.getContractArtifact(instance.currentContractClassId);
      await this.registerContract(
        instance,
        !existingArtifact ? await accountManager.getAccountContract().getContractArtifact() : undefined,
        accountManager.getSecretKey(),
      );
    }
    return accountManager;
  }

  async createAndStoreAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer,
  ): Promise<AccountManager> {
    const accountManager = await this.createAccountInternal(type, secret, salt, signingKey);
    await this.walletDB.storeAccount(accountManager.address, { type, secretKey: secret, salt, alias, signingKey });
    return accountManager;
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq, alias?: string): Promise<AccountManager> {
    const sk = signingKey ?? deriveSigningKey(secret);
    return this.createAndStoreAccount(alias ?? '', 'schnorr', secret, salt, sk.toBuffer());
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string): Promise<AccountManager> {
    return this.createAndStoreAccount(alias ?? '', 'ecdsasecp256r1', secret, salt, signingKey);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string): Promise<AccountManager> {
    return this.createAndStoreAccount(alias ?? '', 'ecdsasecp256k1', secret, salt, signingKey);
  }

  setMinFeePadding(value?: number) {
    this.minFeePadding = value ?? 0.5;
  }

  stop() {
    return this.pxe.stop();
  }
}
