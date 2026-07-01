import { EcdsaKAccountContract, EcdsaRAccountContract, EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
import { StubEcdsaAccountContractArtifact, createStubEcdsaAccount } from '@aztec/accounts/ecdsa/stub';
import { SchnorrAccountContract, SchnorrInitializerlessAccountContract } from '@aztec/accounts/schnorr';
import { StubSchnorrAccountContractArtifact, createStubSchnorrAccount } from '@aztec/accounts/schnorr/stub';
import { getIdentities } from '@aztec/accounts/utils';
import { type Account, type AccountContract, NO_FROM } from '@aztec/aztec.js/account';
import {
  ContractFunctionInteraction,
  type InteractionFeeOptions,
  getContractClassFromArtifact,
} from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, type Aliased } from '@aztec/aztec.js/wallet';
import { TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { LogFn } from '@aztec/foundation/log';
import type { NotesFilter } from '@aztec/pxe/client/lazy';
import type { PXEConfig } from '@aztec/pxe/config';
import type { PXE } from '@aztec/pxe/server';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { Gas, GasUsed } from '@aztec/stdlib/gas';
import { NoteDao } from '@aztec/stdlib/note';
import type { SimulationOverrides, TxExecutionRequest, TxProvingResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet, type SimulateViaEntrypointOptions, getGasLimits } from '@aztec/wallet-sdk/base-wallet';

import type { WalletDB } from '../storage/wallet_db.js';
import type { AccountType } from './constants.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';

/** Padding the CLI wallet applies to simulated gas usage when deriving declared gas limits. */
const DEFAULT_ESTIMATED_GAS_PADDING = 0.1;

export class CLIWallet extends BaseWallet {
  private accountCache = new Map<string, Account>();
  // Stub class ids, populated on wallet startup
  // to avoid redundant work per simulation
  private stubClassIds = new Map<AccountType, Fr>();

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
    const wallet = new CLIWallet(pxe, node, log, db);
    await wallet.initStubClasses();
    await wallet.registerAuthRegistry();
    return wallet;
  }

  private async registerAuthRegistry(): Promise<void> {
    const { instance, artifact } = await getStandardAuthRegistry();
    await this.pxe.registerContract({ instance, artifact });
  }

  /**
   * Hashes and registers the stub class for every supported account type with PXE, populating
   * stubClassIds. Called on wallet initialization.
   */
  private async initStubClasses(): Promise<void> {
    const { id: schnorrClassId } = await getContractClassFromArtifact(StubSchnorrAccountContractArtifact);
    await this.pxe.registerContractClass(StubSchnorrAccountContractArtifact);

    // ecdsa stubs share the same class id
    const { id: ecdsaClassId } = await getContractClassFromArtifact(StubEcdsaAccountContractArtifact);
    await this.pxe.registerContractClass(StubEcdsaAccountContractArtifact);

    this.stubClassIds.set('schnorr', schnorrClassId);
    this.stubClassIds.set('schnorr_initializerless', schnorrClassId);
    this.stubClassIds.set('ecdsasecp256k1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1ssh', ecdsaClassId);
  }

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const accounts = (await this.db?.listAliases('accounts')) ?? [];
    return Promise.resolve(
      accounts.map(({ key, value }) => {
        const alias = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
        return { alias, item: AztecAddress.fromStringUnsafe(value) };
      }),
    );
  }

  /**
   * Derives suggested total and teardown gas limits from simulated gas usage, padded and clamped to the
   * network's per-tx admission limits.
   * @param gasUsed - The gas consumed during simulation (from a `simulate({ includeMetadata: true })` result).
   */
  async estimateGasLimits(gasUsed: GasUsed): Promise<{ gasLimits: Gas; teardownGasLimits: Gas }> {
    const maxTxGasLimits = await this.getMaxTxGasLimits();
    return getGasLimits(gasUsed, maxTxGasLimits, DEFAULT_ESTIMATED_GAS_PADDING);
  }

  private async createCancellationTxExecutionRequest(
    from: AztecAddress,
    txNonce: Fr,
    increasedFee: InteractionFeeOptions,
  ) {
    const executionPayload = ExecutionPayload.empty();
    const feeOptions = await this.completeFeeOptions({
      from,
      feePayer: executionPayload.feePayer,
      gasSettings: increasedFee.gasSettings,
    });
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const fromAccount = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce,
      cancellable: this.cancellableTransactions,
      // If from is an address, feeOptions include the way the account contract should handle the fee payment
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
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
    return await this.pxe.proveTx(cancellationTxRequest, { scopes: this.scopesFrom(from), senderForTags: from });
  }

  override async getAccountFromAddress(address: AztecAddress) {
    let account: Account | undefined;
    if (this.accountCache.has(address.toString())) {
      return this.accountCache.get(address.toString())!;
    } else {
      const accountManager = await this.retrieveAccount(address);
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }
    return account;
  }

  /**
   * Creates an account from freshly supplied keys. SSH accounts sign with a key held in the agent (resolved from
   * `publicKey`), every other type is rooted on `signingKey`, with `secretKey` as its privacy secret.
   */
  async createAccount(
    type: AccountType,
    signingKey: GrumpkinScalar | undefined,
    secretKey: Fr | undefined,
    salt: Fr = Fr.ZERO,
    publicKey?: string,
  ): Promise<AccountManager> {
    const publicSigningKey =
      type === 'ecdsasecp256r1ssh' ? await this.resolveSshPublicSigningKey(publicKey) : undefined;
    return this.buildAccount(type, salt, signingKey, secretKey, publicSigningKey);
  }

  /**
   * Retrieves a previously stored account by address, loading its keys, type and salt from the wallet database.
   */
  async retrieveAccount(address: AztecAddress): Promise<AccountManager> {
    if (!this.db) {
      throw new Error('Cannot retrieve an account without a wallet database');
    }
    const { type, signingKey, secretKey, salt } = await this.db.retrieveAccount(address);
    const publicSigningKey =
      type === 'ecdsasecp256r1ssh' ? await this.db.retrieveAccountMetadata(address, 'publicSigningKey') : undefined;
    return this.buildAccount(type, salt, signingKey, secretKey, publicSigningKey);
  }

  private async buildAccount(
    type: AccountType,
    salt: Fr,
    signingKey: GrumpkinScalar | undefined,
    secretKey: Fr | undefined,
    publicSigningKey: Buffer | undefined,
  ): Promise<AccountManager> {
    switch (type) {
      case 'schnorr':
      case 'schnorr_initializerless':
      case 'ecdsasecp256r1':
      case 'ecdsasecp256k1': {
        if (!signingKey || !secretKey) {
          throw new Error('Cannot build account without signing key and secret key');
        }
        const contract =
          type === 'schnorr'
            ? new SchnorrAccountContract(signingKey)
            : type === 'schnorr_initializerless'
              ? new SchnorrInitializerlessAccountContract(signingKey)
              : type === 'ecdsasecp256r1'
                ? new EcdsaRAccountContract(signingKey.toBuffer())
                : new EcdsaKAccountContract(signingKey.toBuffer());
        return await this.materializeAccount(secretKey, salt, contract);
      }
      case 'ecdsasecp256r1ssh': {
        if (!secretKey || !publicSigningKey) {
          throw new Error('Cannot build SSH account without secret key and public signing key');
        }
        return await this.materializeAccount(secretKey, salt, new EcdsaRSSHAccountContract(publicSigningKey));
      }
      default: {
        throw new Error(`Unsupported account type: ${type}`);
      }
    }
  }

  private async resolveSshPublicSigningKey(publicKey: string | undefined): Promise<Buffer> {
    if (!publicKey) {
      throw new Error('Public key must be provided for ECDSA SSH account');
    }
    const identities = await getIdentities();
    const foundIdentity = identities.find(
      identity => identity.type === 'ecdsa-sha2-nistp256' && identity.publicKey === publicKey,
    );
    if (!foundIdentity) {
      throw new Error(`Identity for public key ${publicKey} not found in the SSH agent`);
    }
    return extractECDSAPublicKeyFromBase64String(foundIdentity.publicKey);
  }

  private async materializeAccount(secret: Fr, salt: Fr, contract: AccountContract): Promise<AccountManager> {
    const accountManager = await AccountManager.create(this, secret, contract, { salt });

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);
    this.accountCache.set(accountManager.address.toString(), await accountManager.getAccount());

    // Initializerless accounts have no deployment tx; their address commits to the signing public key
    // (via the contract's immutablesHash, resolved by AccountManager.create) and the constructor's
    // storage writes are materialized locally via a simulated "store" call here.
    if (contract instanceof SchnorrInitializerlessAccountContract) {
      const constructorAbi = artifact.functions.find(f => f.name === 'constructor');
      if (!constructorAbi) {
        throw new Error('Could not create SchnorrInitializerlessAccount: constructor ABI not found');
      }
      const { x, y } = await contract.getSigningPublicKey();
      const storeCall = new ContractFunctionInteraction(this, instance.address, constructorAbi, [x, y]);
      await storeCall.simulate({ from: instance.address });
    }

    return accountManager;
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const { type } = await this.db!.retrieveAccount(address);
    const stubAccount =
      type === 'schnorr' || type === 'schnorr_initializerless'
        ? createStubSchnorrAccount(originalAddress)
        : createStubEcdsaAccount(originalAddress);
    const stubClassId = this.stubClassIds.get(type);
    if (!stubClassId) {
      throw new Error(
        `Stub class for account type '${type}' was not registered at wallet init. This is a bug — initStubClasses should cover every supported AccountType.`,
      );
    }
    const instance = { ...contractInstance, currentContractClassId: stubClassId };
    return { account: stubAccount, instance };
  }

  /**
   * Uses a stub account for kernelless simulation, bypassing real account authorization.
   * Uses DefaultEntrypoint directly for NO_FROM transactions.
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    opts: SimulateViaEntrypointOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const { from, feeOptions, additionalScopes, sendMessagesAs } = opts;
    const scopes = this.scopesFrom(from, additionalScopes);
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    let overrides: SimulationOverrides | undefined;
    let txRequest: TxExecutionRequest;
    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      txRequest = await entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      const { account, instance } = await this.getFakeAccountDataFor(from);
      overrides = {
        contracts: { [from.toString()]: { instance } },
      };
      const executionOptions: DefaultAccountEntrypointOptions = {
        txNonce: Fr.random(),
        cancellable: this.cancellableTransactions,
        // If from is an address, feeOptions include the way the account contract should handle the fee payment
        feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
      };
      txRequest = await account.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        chainInfo,
        executionOptions,
      );
    }

    const result = await this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipFeeEnforcement: true,
      skipTxValidation: true,
      overrides,
      scopes,
      senderForTags: this.senderForTagsFrom(from, sendMessagesAs),
    });
    const appCallOffset = await this.computeAppCallOffset(from, feeOptions);
    return TxSimulationResultWithAppOffset.fromResultAndOffset(result, appCallOffset);
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
