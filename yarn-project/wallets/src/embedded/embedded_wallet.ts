import { type Account, NO_FROM } from '@aztec/aztec.js/account';
import { CallAuthorizationRequest } from '@aztec/aztec.js/authorization';
import {
  ContractFunctionInteraction,
  type InteractionWaitOptions,
  NO_WAIT,
  type SendReturn,
  type WaitOpts,
} from '@aztec/aztec.js/contracts';
import type {
  Aliased,
  ExecuteUtilityOptions,
  PrivateEvent,
  PrivateEventFilter,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
} from '@aztec/aztec.js/wallet';
import { AccountManager, TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { PXEConfig, PXECreationOptions } from '@aztec/pxe/client/lazy';
import { DeliveryPrivacyPreference, type ExecutionHooks } from '@aztec/pxe/config';
import type { PXE } from '@aztec/pxe/server';
import type { ContractArtifact, EventMetadataDefinition, FunctionCall } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  type ContractOverrides,
  ExecutionPayload,
  SimulationOverrides,
  type TxExecutionRequest,
  type TxProfileResult,
  TxStatus,
  type UtilityExecutionResult,
  collectOffchainEffects,
  mergeExecutionPayloads,
} from '@aztec/stdlib/tx';
import { BaseWallet, type SimulateViaEntrypointOptions, getGasLimits } from '@aztec/wallet-sdk/base-wallet';

import type { AccountContractsProvider } from './account-contract-providers/types.js';
import { type AccountType, WalletDB } from './wallet_db.js';

/**
 * Options for the PXE instance created by the EmbeddedWallet.
 *
 * Unless overridden via `hooks.getDeliveryPrivacyPreference`, the embedded wallet reports a best-effort delivery
 * privacy preference (a bare PXE defaults to max privacy), trading the privacy cost of on-chain handshakes for
 * message delivery that works without sender and recipient having to coordinate.
 */
export type EmbeddedWalletPXEOptions = Partial<PXEConfig> & PXECreationOptions;

/** Splits a unified EmbeddedWalletPXEOptions into PXEConfig overrides and PXECreationOptions. */
export function splitPxeOptions(pxe?: EmbeddedWalletPXEOptions): {
  config: Partial<PXEConfig>;
  creation: PXECreationOptions;
} {
  if (!pxe) {
    return { config: {}, creation: {} };
  }
  const { loggers, loggerActorLabel, proverOrOptions, store, simulator, hooks, preloadedContractsProvider, ...config } =
    pxe;
  return {
    config,
    creation: { loggers, loggerActorLabel, proverOrOptions, store, simulator, hooks, preloadedContractsProvider },
  };
}

/**
 * Applies the embedded wallet's default execution hooks on top of user-provided ones, defaulting the delivery
 * privacy preference to best effort (see {@link EmbeddedWalletPXEOptions} for why).
 */
export function applyEmbeddedWalletHookDefaults(hooks: ExecutionHooks | undefined): ExecutionHooks {
  return {
    getDeliveryPrivacyPreference: () => Promise.resolve(DeliveryPrivacyPreference.BEST_EFFORT),
    ...hooks,
  };
}

/** Options for the EmbeddedWallet's own DB (accounts, senders — distinct from PXE state). */
export type EmbeddedWalletDBOptions = {
  /** Override the wallet DB backend. If omitted, an IndexedDB (browser) / LMDB (node) store is created. */
  store?: AztecAsyncKVStore;
};

export type EmbeddedWalletOptions = {
  /** Parent logger. Child loggers are derived via createChild() for each subsystem. */
  logger?: Logger;
  /** Use ephemeral (in-memory) stores. Data will not persist across sessions. */
  ephemeral?: boolean;
  /** PXE configuration and dependency overrides (custom store, prover, simulator). */
  pxe?: EmbeddedWalletPXEOptions;
  /** Wallet DB dependency overrides (custom store). */
  walletDb?: EmbeddedWalletDBOptions;
  /**
   * Override PXE configuration.
   * @deprecated Use `pxe` instead.
   */
  pxeConfig?: Partial<PXEConfig>;
  /**
   * Advanced PXE creation options (custom store, prover, simulator).
   * @deprecated Use `pxe` instead.
   */
  pxeOptions?: PXECreationOptions;
};

const DEFAULT_ESTIMATED_GAS_PADDING = 0.1;

export class EmbeddedWallet extends BaseWallet {
  protected estimatedGasPadding = DEFAULT_ESTIMATED_GAS_PADDING;

  // Stub class ids, populated on wallet startup
  // to avoid redundant work per simulation
  protected stubClassIds = new Map<AccountType, Fr>();

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
   * Overrides the base sendTx to add a pre-simulation step before the actual send. The simulation
   * estimates actual gas usage and captures call authorization requests to generate
   * the necessary authwitnesses.
   */
  public override async sendTx<W extends InteractionWaitOptions = undefined>(
    executionPayload: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    // PXE has autoSync disabled by the embedded wallet entrypoints, so we sync once here to cover
    // both the inner simulateTx (via simulateViaEntrypoint) and the proveTx that super.sendTx
    await this.pxe.sync();
    const feeOptions = await this.completeFeeOptions({
      from: opts.from,
      feePayer: executionPayload.feePayer,
      gasSettings: opts.fee?.gasSettings,
      forEstimation: true,
    });

    // Simulate the transaction first to estimate gas and capture required
    // private authwitnesses based on offchain effects.
    const simulationResult = await this.simulateViaEntrypoint(executionPayload, {
      from: opts.from,
      feeOptions,
      additionalScopes: opts.additionalScopes,
      skipTxValidation: true,
      sendMessagesAs: opts.sendMessagesAs,
    });

    const offchainEffects = collectOffchainEffects(simulationResult.privateExecutionResult);
    const authWitnesses = await Promise.all(
      offchainEffects.map(async effect => {
        try {
          const authRequest = await CallAuthorizationRequest.fromFields(effect.data);
          return this.createAuthWit(authRequest.onBehalfOf, {
            consumer: effect.contractAddress,
            innerHash: authRequest.innerHash,
          });
        } catch {
          return undefined;
        }
      }),
    );
    for (const authwit of authWitnesses) {
      if (authwit) {
        executionPayload.authWitnesses.push(authwit);
      }
    }
    const maxTxGasLimits = await this.getMaxTxGasLimits();
    const estimated = getGasLimits(simulationResult.gasUsed, maxTxGasLimits, this.estimatedGasPadding);
    this.log.verbose(
      `Estimated gas limits for tx: DA=${estimated.gasLimits.daGas} L2=${estimated.gasLimits.l2Gas} teardownDA=${estimated.teardownGasLimits.daGas} teardownL2=${estimated.teardownGasLimits.l2Gas}`,
    );
    const gasSettings = GasSettings.from({
      ...opts.fee?.gasSettings,
      maxFeesPerGas: feeOptions.gasSettings.maxFeesPerGas,
      maxPriorityFeesPerGas: feeOptions.gasSettings.maxPriorityFeesPerGas,
      gasLimits: opts.fee?.gasSettings?.gasLimits ?? estimated.gasLimits,
      teardownGasLimits: opts.fee?.gasSettings?.teardownGasLimits ?? estimated.teardownGasLimits,
    });
    let wait: InteractionWaitOptions = opts.wait;
    if (wait !== NO_WAIT) {
      const callerWaitOpts: WaitOpts = typeof wait === 'object' ? wait : {};
      wait = {
        ...callerWaitOpts,
        // Default to PROPOSED so the wait returns as soon as the tx lands in a proposed L2 block,
        // rather than waiting until the end of the slot for the checkpoint to be published to L1.
        // This is what makes MBPS (Multiple Blocks Per Slot) actually improve UX: with CHECKPOINTED
        // we'd block until L1 inclusion regardless of how early in the slot the tx was sequenced.
        // The tradeoff is a weaker guarantee — a proposed block only becomes canonical once it (or
        // a later block in the same slot) is checkpointed, so a tx could be re-orged out if the
        // proposer fails to publish to L1 (which should be rare, since they'd get slashed for it).
        waitForStatus: callerWaitOpts.waitForStatus ?? TxStatus.PROPOSED,
      };
    }
    return super.sendTx(executionPayload, {
      ...opts,
      wait: wait as W,
      fee: { ...opts.fee, gasSettings },
    });
  }

  /**
   * Overrides the base simulateTx to drive PXE syncing explicitly. The PXE created by the embedded
   * wallet has autoSync disabled (so we can share one sync across simulate+send in sendTx); for
   * standalone simulations we still need a fresh anchor block, which we provide here.
   */
  public override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    await this.pxe.sync();
    return super.simulateTx(executionPayload, opts);
  }

  public override async profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    await this.pxe.sync();
    return super.profileTx(executionPayload, opts);
  }

  public override async executeUtility(
    call: FunctionCall,
    opts: ExecuteUtilityOptions,
  ): Promise<UtilityExecutionResult> {
    await this.pxe.sync();
    return super.executeUtility(call, opts);
  }

  public override async getPrivateEvents<T>(
    eventDef: EventMetadataDefinition,
    eventFilter: PrivateEventFilter,
  ): Promise<PrivateEvent<T>[]> {
    await this.pxe.sync();
    return super.getPrivateEvents<T>(eventDef, eventFilter);
  }

  public override async registerContract(
    instance: ContractInstanceWithAddress,
    artifact?: ContractArtifact,
    secretKey?: Fr,
  ): Promise<ContractInstanceWithAddress> {
    // registerContract may call pxe.updateContract under the hood, which depends on a fresh anchor
    // block to verify the current class id from the node.
    await this.pxe.sync();
    return super.registerContract(instance, artifact, secretKey);
  }

  /**
   * Hashes and registers the stub class for every supported account type with PXE, populating
   * stubClassIds. Called on wallet initialization.
   */
  async initStubClasses(): Promise<void> {
    const schnorrArtifact = await this.accountContracts.getStubAccountContractArtifact('schnorr');
    const { id: schnorrClassId } = await getContractClassFromArtifact(schnorrArtifact);
    await this.pxe.registerContractClass(schnorrArtifact);

    // ecdsa stubs share the same class id
    const ecdsaArtifact = await this.accountContracts.getStubAccountContractArtifact('ecdsasecp256r1');
    const { id: ecdsaClassId } = await getContractClassFromArtifact(ecdsaArtifact);
    await this.pxe.registerContractClass(ecdsaArtifact);

    this.stubClassIds.set('schnorr', schnorrClassId);
    this.stubClassIds.set('schnorr_initializerless', schnorrClassId);
    this.stubClassIds.set('ecdsasecp256k1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1', ecdsaClassId);
  }

  /**
   * Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations.
   * Uses a type-specific stub artifact so that the stub's constructor selector matches the real account's constructor.
   */
  protected async buildAccountOverrides(addresses: AztecAddress[]): Promise<ContractOverrides> {
    const accounts = await this.getAccounts();
    const contracts: ContractOverrides = {};

    const filtered = accounts.filter(acc => addresses.some(addr => addr.equals(acc.item)));

    for (const account of filtered) {
      const address = account.item;
      const { type } = await this.walletDB.retrieveAccount(address);
      const stubClassId = this.stubClassIds.get(type);
      if (!stubClassId) {
        throw new Error(
          `Stub class for account type '${type}' was not registered at wallet init. This is a bug — initStubClasses should cover every supported AccountType.`,
        );
      }

      const originalAccount = await this.getAccountFromAddress(address);
      const completeAddress = originalAccount.getCompleteAddress();
      const contractInstance = await this.pxe.getContractInstance(completeAddress.address);
      if (!contractInstance) {
        throw new Error(
          `No contract instance found for address: ${completeAddress.address} during account override building. This is a bug!`,
        );
      }

      contracts[address.toString()] = {
        instance: { ...contractInstance, currentContractClassId: stubClassId },
      };
    }

    return contracts;
  }

  /**
   * Simulates calls via a stub account entrypoint, bypassing real account authorization.
   * This allows kernelless simulation with contract overrides, skipping expensive
   * private kernel circuit execution.
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    opts: SimulateViaEntrypointOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const { from, feeOptions, additionalScopes, skipTxValidation, skipFeeEnforcement, sendMessagesAs } = opts;
    const scopes = this.scopesFrom(from, additionalScopes);

    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    const accountOverrides = await this.buildAccountOverrides(scopes);
    const overrides = new SimulationOverrides({ contracts: accountOverrides });

    let txRequest: TxExecutionRequest;
    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      txRequest = await entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      const { type } = await this.walletDB.retrieveAccount(from);
      const originalAccount = await this.getAccountFromAddress(from);
      const completeAddress = originalAccount.getCompleteAddress();
      const account = await this.accountContracts.createStubAccount(completeAddress, type);
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
      skipFeeEnforcement,
      skipTxValidation,
      overrides,
      scopes,
      senderForTags: this.senderForTagsFrom(from, sendMessagesAs),
    });
    const appCallOffset = await this.computeAppCallOffset(from, feeOptions);
    return TxSimulationResultWithAppOffset.fromResultAndOffset(result, appCallOffset);
  }

  protected async createAccountInternal(
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer,
  ): Promise<AccountManager> {
    let contract;
    let immutablesHash;
    let publicKey;
    switch (type) {
      case 'schnorr': {
        contract = await this.accountContracts.getSchnorrAccountContract(Fq.fromBuffer(signingKey));
        break;
      }
      case 'schnorr_initializerless': {
        contract = await this.accountContracts.getSchnorrInitializerlessAccountContract(Fq.fromBuffer(signingKey));
        publicKey = await new Schnorr().computePublicKey(Fq.fromBuffer(signingKey));
        immutablesHash = await poseidon2Hash([publicKey.x, publicKey.y]);
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

    const accountManager = await AccountManager.create(this, secret, contract, { salt, immutablesHash });

    const instance = accountManager.getInstance();
    const existingInstance = await this.pxe.getContractInstance(instance.address);
    if (!existingInstance) {
      const existingArtifact = await this.pxe.getContractArtifact(instance.currentContractClassId);
      const artifact = existingArtifact ?? (await accountManager.getAccountContract().getContractArtifact());
      await this.registerContract(
        instance,
        !existingArtifact ? await accountManager.getAccountContract().getContractArtifact() : undefined,
        accountManager.getSecretKey(),
      );
      if (type === 'schnorr_initializerless') {
        const constructor = artifact.functions.find(f => f.name === 'constructor');
        if (!constructor) {
          throw new Error('Could not create SchnorrInitializerlessAccountContract: constructor ABI not found');
        }
        const storeCall = new ContractFunctionInteraction(this, instance.address, constructor, [
          publicKey!.x,
          publicKey!.y,
        ]);
        await storeCall.simulate({ from: instance.address });
      }
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

  createSchnorrInitializerlessAccount(secret: Fr, salt: Fr, signingKey?: Fq, alias?: string): Promise<AccountManager> {
    const sk = signingKey ?? deriveSigningKey(secret);
    return this.createAndStoreAccount(alias ?? '', 'schnorr_initializerless', secret, salt, sk.toBuffer());
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

  setEstimatedGasPadding(value?: number) {
    this.estimatedGasPadding = value ?? DEFAULT_ESTIMATED_GAS_PADDING;
  }

  async stop(): Promise<void> {
    await this.pxe.stop();
    await this.walletDB.close();
  }
}
