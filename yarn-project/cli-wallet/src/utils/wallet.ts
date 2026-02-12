import { EcdsaRAccountContract, EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { getIdentities } from '@aztec/accounts/utils';
import { type Account, type AccountContract, SignerlessAccount } from '@aztec/aztec.js/account';
import {
  type InteractionFeeOptions,
  getContractInstanceFromInstantiationParams,
  getGasLimits,
} from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, type Aliased, type SimulateOptions } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';
import type { PXEConfig } from '@aztec/pxe/config';
import type { PXE } from '@aztec/pxe/server';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { NoteDao } from '@aztec/stdlib/note';
import type { NotesFilter } from '@aztec/stdlib/note';
import type { TxProvingResult, TxSimulationResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet, type FeeOptions } from '@aztec/wallet-sdk/base-wallet';

import type { WalletDB } from '../storage/wallet_db.js';
import type { AccountType } from './constants.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';
import { printGasEstimates } from './options/fees.js';

export class CLIWallet extends BaseWallet {
  private accountCache = new Map<string, Account>();

  constructor(
    pxe: PXE,
    node: AztecNode,
    private userLog: LogFn,
    private db?: WalletDB,
  ) {
    super(pxe, node);
    this.cancellableTransactions = true;
  }

  static async create(
    node: AztecNode,
    log: LogFn,
    db?: WalletDB,
    overridePXEConfig?: Partial<PXEConfig>,
  ): Promise<CLIWallet> {
    const pxeConfig = Object.assign(getPXEConfig(), overridePXEConfig);
    const pxe = await createPXE(node, pxeConfig);
    return new CLIWallet(pxe, node, log, db);
  }

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const accounts = (await this.db?.listAliases('accounts')) ?? [];
    return Promise.resolve(accounts.map(({ key, value }) => ({ alias: value, item: AztecAddress.fromString(key) })));
  }

  private async createCancellationTxExecutionRequest(
    from: AztecAddress,
    txNonce: Fr,
    increasedFee: InteractionFeeOptions,
  ) {
    const executionPayload = ExecutionPayload.empty();
    const feeOptions = await this.completeFeeOptions(from, executionPayload.feePayer, increasedFee.gasSettings);
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const fromAccount = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce,
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    return await fromAccount.createTxExecutionRequest(
      feeExecutionPayload ?? executionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
  }

  async proveCancellationTx(
    from: AztecAddress,
    txNonce: Fr,
    increasedFee: InteractionFeeOptions,
  ): Promise<TxProvingResult> {
    const cancellationTxRequest = await this.createCancellationTxExecutionRequest(from, txNonce, increasedFee);
    return await this.pxe.proveTx(cancellationTxRequest, this.scopesFor(from));
  }

  override async getAccountFromAddress(address: AztecAddress) {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      account = new SignerlessAccount();
    } else if (this.accountCache.has(address.toString())) {
      return this.accountCache.get(address.toString())!;
    } else {
      const accountManager = await this.createOrRetrieveAccount(address);
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }
    return account;
  }

  private async createAccount(secret: Fr, salt: Fr, contract: AccountContract): Promise<AccountManager> {
    const accountManager = await AccountManager.create(this, secret, contract, salt);

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);
    this.accountCache.set(accountManager.address.toString(), await accountManager.getAccount());
    return accountManager;
  }

  async createOrRetrieveAccount(
    address?: AztecAddress,
    secretKey?: Fr,
    type: AccountType = 'schnorr',
    salt?: Fr,
    publicKey?: string,
  ): Promise<AccountManager> {
    let account;

    salt ??= Fr.ZERO;

    if (this.db && address) {
      ({ type, secretKey, salt } = await this.db.retrieveAccount(address));
    }

    if (!secretKey) {
      throw new Error('Cannot retrieve/create wallet without secret key');
    }

    switch (type) {
      case 'schnorr': {
        account = await this.createAccount(secretKey, salt, new SchnorrAccountContract(deriveSigningKey(secretKey)));
        break;
      }
      case 'ecdsasecp256r1': {
        account = await this.createAccount(
          secretKey,
          salt,
          new EcdsaRAccountContract(deriveSigningKey(secretKey).toBuffer()),
        );
        break;
      }
      case 'ecdsasecp256r1ssh': {
        let publicSigningKey;
        if (this.db && address) {
          publicSigningKey = await this.db.retrieveAccountMetadata(address, 'publicSigningKey');
        } else if (publicKey) {
          const identities = await getIdentities();
          const foundIdentity = identities.find(
            identity => identity.type === 'ecdsa-sha2-nistp256' && identity.publicKey === publicKey,
          );
          if (!foundIdentity) {
            throw new Error(`Identity for public key ${publicKey} not found in the SSH agent`);
          }
          publicSigningKey = extractECDSAPublicKeyFromBase64String(foundIdentity.publicKey);
        } else {
          throw new Error('Public key must be provided for ECDSA SSH account');
        }
        account = await this.createAccount(secretKey, salt, new EcdsaRSSHAccountContract(publicSigningKey));
        break;
      }
      default: {
        throw new Error(`Unsupported account type: ${type}`);
      }
    }

    return account;
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    // Account contracts can only be overridden if they have an associated address
    // Overwriting SignerlessAccount is not supported, and does not really make sense
    // since it has no authorization mechanism.
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(`Cannot create fake account data for SignerlessAccount at address: ${address}`);
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress);
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }

  override async simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult> {
    const simulationResults = await super.simulateTx(executionPayload, opts);

    if (opts.fee?.estimateGas) {
      const feeOptions = await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
      const limits = getGasLimits(simulationResults, opts.fee?.estimatedGasPadding);
      printGasEstimates(feeOptions, limits, this.userLog);
    }
    return simulationResults;
  }

  /**
   * Uses a stub account for kernelless simulation, bypassing real account authorization.
   * Falls through to the standard entrypoint path for SignerlessAccount (ZERO address).
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ): Promise<TxSimulationResult> {
    if (from.equals(AztecAddress.ZERO)) {
      return super.simulateViaEntrypoint(executionPayload, from, feeOptions, skipTxValidation, skipFeeEnforcement);
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

    const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(from);
    const chainInfo = await this.getChainInfo();
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
    return this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipFeeEnforcement: true,
      skipTxValidation: true,
      overrides: {
        contracts: { [from.toString()]: { instance, artifact } },
      },
    });
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getContracts(): Promise<AztecAddress[]> {
    return this.pxe.getContracts();
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    return this.pxe.debug.getNotes(filter);
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getContractArtifact(id: Fr) {
    return this.pxe.getContractArtifact(id);
  }
}
