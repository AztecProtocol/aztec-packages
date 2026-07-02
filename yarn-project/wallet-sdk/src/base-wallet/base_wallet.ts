import type { Account, NoFrom } from '@aztec/aztec.js/account';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import {
  type InteractionWaitOptions,
  NO_WAIT,
  type SendReturn,
  extractOffchainOutput,
} from '@aztec/aztec.js/contracts';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { waitForTx } from '@aztec/aztec.js/node';
import {
  type Aliased,
  type AppCapabilities,
  type BatchResults,
  type BatchedMethod,
  ContractInitializationStatus,
  type ExecuteUtilityOptions,
  type PrivateEvent,
  type PrivateEventFilter,
  type ProfileOptions,
  type SendOptions,
  type SimulateOptions,
  TxSimulationResultWithAppOffset,
  type Wallet,
  type WalletCapabilities,
} from '@aztec/aztec.js/wallet';
import { AccountFeePaymentMethodOptions, type DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import { displayDebugLogs } from '@aztec/pxe/client/lazy';
import type { PXE, PackedPrivateEvent } from '@aztec/pxe/server';
import {
  type ContractArtifact,
  type EventMetadataDefinition,
  type FunctionCall,
  decodeFromAbi,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  type NodeInfo,
  computePartialAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasFees, GasSettings, ManaUsageEstimate } from '@aztec/stdlib/gas';
import {
  computeSiloedPrivateInitializationNullifier,
  computeSiloedPublicInitializationNullifier,
} from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { type MasterSecretKeys, deriveKeys, deriveKeysFromMasterSecretKeys } from '@aztec/stdlib/keys';
import {
  BlockHeader,
  ExecutionPayload,
  type TxExecutionRequest,
  type TxProfileResult,
  type UtilityExecutionResult,
  mergeExecutionPayloads,
} from '@aztec/stdlib/tx';

import { inspect } from 'util';

import { assertGasLimitsWithinNetworkLimits } from './get_gas_limits.js';
import { buildMergedSimulationResult, extractOptimizablePublicStaticCalls, simulateViaNode } from './utils.js';

/**
 * Options to configure fee payment for a transaction
 */
export type FeeOptions = {
  /**
   * A wallet-provided fallback fee payment method that is used only if the transaction that is being constructed
   * doesn't already include one
   */
  walletFeePaymentMethod?: FeePaymentMethod;
  /** Configuration options for the account to properly handle the selected fee payment method */
  accountFeePaymentMethodOptions?: AccountFeePaymentMethodOptions;
  /** The gas settings to use for the transaction */
  gasSettings: GasSettings;
};

/** Options for `simulateViaEntrypoint`. */
export type SimulateViaEntrypointOptions = Pick<
  SimulateOptions,
  'from' | 'additionalScopes' | 'skipTxValidation' | 'skipFeeEnforcement' | 'sendMessagesAs' | 'overrides'
> & {
  /** Fee options for the entrypoint */
  feeOptions: FeeOptions;
};

/** Options for `completeFeeOptions`. */
export type CompleteFeeOptionsConfig = {
  /** The address where the transaction is being sent from. */
  from: AztecAddress | NoFrom;
  /** The address paying for fees (if any fee payment method is embedded in the execution payload). */
  feePayer?: AztecAddress;
  /** User-provided partial gas settings. */
  gasSettings?: Partial<FieldsOf<GasSettings>>;
  /** If true, returns gas settings with high gas limits for estimation. If false, uses fallback limits. */
  forEstimation?: boolean;
  /**
   * Assumed network congestion level for fee prediction. Controls how aggressively the wallet
   * estimates future fees. Defaults to Limit (worst case) when not specified.
   */
  congestionEstimate?: ManaUsageEstimate;
};

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  protected minFeePadding = 0.5;
  protected cancellableTransactions = false;
  // A wallet is instantiated for a particular chain, so chain info never changes during its lifetime.
  // We cache it here because getChainInfo is called frequently (every tx simulation, send, auth wit, etc.).
  private nodeInfoPromise: Promise<NodeInfo> | undefined;

  // Protected because we want to force wallets to instantiate their own PXE.
  protected constructor(
    protected readonly pxe: PXE,
    protected readonly aztecNode: AztecNode,
    protected log = createLogger('wallet-sdk:base_wallet'),
  ) {}

  protected scopesFrom(from: AztecAddress | NoFrom, additionalScopes: AztecAddress[] = []): AztecAddress[] {
    const allScopes = from === NO_FROM ? additionalScopes : [from, ...additionalScopes];
    const scopeSet = new Set(allScopes.map(address => address.toString()));
    return [...scopeSet].map(AztecAddress.fromStringUnsafe);
  }

  /**
   * Picks the sender address PXE should tag private messages with. Returns `undefined` when there is no signing
   * account (`from === NO_FROM`) and no explicit override; in that case any private log emitted by the tx using
   * the wallet-supplied default sender will fail the "Sender for tags is not set" assertion.
   * @param from - Tx sender, or `NO_FROM`.
   * @param sendMessagesAs - Explicit override.
   */
  protected senderForTagsFrom(from: AztecAddress | NoFrom, sendMessagesAs?: AztecAddress): AztecAddress | undefined {
    return sendMessagesAs ?? (from === NO_FROM ? undefined : from);
  }

  protected abstract getAccountFromAddress(address: AztecAddress): Promise<Account>;

  abstract getAccounts(): Promise<Aliased<AztecAddress>[]>;

  /**
   * Returns the list of aliased contacts associated with the wallet.
   * This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders.
   *  - Senders: Addresses we check during synching in case they sent us notes,
   *  - Contacts: more general concept akin to a phone's contact list.
   * @returns The aliased collection of AztecAddresses that form this wallet's address book
   */
  async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    const sources = await this.pxe.getTaggingSecretSources({ kind: 'address-derived' });
    return sources.map(source => ({ item: source.sender, alias: '' }));
  }

  /**
   * Fetches and caches the node info for the wallet's lifetime, since a wallet talks to a single network and
   * node info never changes. A rejected fetch clears the cache so the next call retries instead of replaying
   * the cached rejection forever — important because the gas-limit fill-in and validation (run on every send)
   * depend on it.
   */
  private getNodeInfo(): Promise<NodeInfo> {
    if (!this.nodeInfoPromise) {
      this.nodeInfoPromise = this.aztecNode.getNodeInfo().catch(err => {
        this.nodeInfoPromise = undefined;
        throw err;
      });
    }
    return this.nodeInfoPromise;
  }

  async getChainInfo(): Promise<ChainInfo> {
    const { l1ChainId, rollupVersion } = await this.getNodeInfo();
    return { chainId: new Fr(l1ChainId), version: new Fr(rollupVersion) };
  }

  /**
   * Returns the maximum gas limits a single transaction may declare on this wallet's network (the
   * node-advertised `txsLimits.gas`). Internal helper used to fill in default gas limits when sending a
   * transaction without explicit limits, and to validate caller-provided limits before sending. Backed by
   * the cached node info, since a wallet talks to a single network.
   */
  protected async getMaxTxGasLimits(): Promise<Gas> {
    const { txsLimits } = await this.getNodeInfo();
    return new Gas(txsLimits.gas.daGas, txsLimits.gas.l2Gas);
  }

  protected async createTxExecutionRequestFromPayloadAndFee(
    executionPayload: ExecutionPayload,
    from: AztecAddress | NoFrom,
    feeOptions: FeeOptions,
  ): Promise<TxExecutionRequest> {
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      return entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      const fromAccount = await this.getAccountFromAddress(from);
      const executionOptions: DefaultAccountEntrypointOptions = {
        txNonce: Fr.random(),
        cancellable: this.cancellableTransactions,
        // If from is an address, feeOptions include the way the account contract should handle the fee payment
        feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
      };
      return fromAccount.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        chainInfo,
        executionOptions,
      );
    }
  }

  public async createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: IntentInnerHash | CallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    return account.createAuthWit(messageHashOrIntent, chainInfo);
  }

  /**
   * Request capabilities from the wallet.
   *
   * This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet.
   * Embedded wallets typically don't support capability-based authorization (no user authorization flow),
   * while external wallets (browser extensions, hardware wallets) implement this to reduce authorization
   * friction by allowing apps to request permissions upfront.
   *
   * TODO: Consider making it abstract so implementing it is a conscious decision. Leaving it as-is
   * while the feature stabilizes.
   *
   * @param _manifest - Application capability manifest declaring what operations the app needs
   */
  public requestCapabilities(_manifest: AppCapabilities): Promise<WalletCapabilities> {
    throw new Error('Not implemented');
  }

  public async batch<const T extends readonly BatchedMethod[]>(methods: T): Promise<BatchResults<T>> {
    const results: any[] = [];
    for (const method of methods) {
      const { name, args } = method;
      // Type safety is guaranteed by the BatchedMethod type, which ensures that:
      // 1. `name` is a valid batchable method name
      // 2. `args` matches the parameter types of that specific method
      // 3. The return type is correctly mapped in BatchResults<T>
      // We use dynamic dispatch here for simplicity, but the types are enforced at the call site.

      const fn = this[name] as (...args: any[]) => Promise<any>;
      const result = await fn.apply(this, args);
      // Wrap result with method name for discriminated union deserialization
      results.push({ name, result });
    }
    return results as BatchResults<T>;
  }

  /**
   * Completes partial user-provided fee options with wallet defaults.
   * @param config - Fee completion config.
   */
  protected async completeFeeOptions(config: CompleteFeeOptionsConfig): Promise<FeeOptions> {
    const { from, feePayer, gasSettings, forEstimation, congestionEstimate } = config;
    const maxFeesPerGas =
      gasSettings?.maxFeesPerGas ?? (await this.getMinFees(congestionEstimate)).mul(1 + this.minFeePadding);
    let accountFeePaymentMethodOptions;
    // If from is an address, we need to determine the appropriate fee payment method options for the
    // account contract entrypoint to use
    if (from !== NO_FROM) {
      if (!feePayer) {
        // The transaction does not include a fee payment method, so we set the flag
        // for the account to use its fee juice balance
        accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE;
      } else {
        // The transaction includes fee payment method, so we check if we are the fee payer for it
        // (this can only happen if the embedded payment method is FeeJuiceWithClaim)
        accountFeePaymentMethodOptions = from.equals(feePayer)
          ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
          : AccountFeePaymentMethodOptions.EXTERNAL;
      }
    }
    const gasSettingsOverrides = {
      gasLimits: gasSettings?.gasLimits ? Gas.from(gasSettings.gasLimits) : undefined,
      teardownGasLimits: gasSettings?.teardownGasLimits ? Gas.from(gasSettings.teardownGasLimits) : undefined,
      maxFeesPerGas,
      maxPriorityFeesPerGas: gasSettings?.maxPriorityFeesPerGas ?? GasFees.empty(),
    };
    // When estimating gas (simulation), use high limits so the simulation doesn't run out of gas.
    // When sending for real without explicit limits, declare the most a single tx may use on this network
    // (the node's per-tx admission limit), so the proposer does not skip the tx for over-declaring gas.
    let fullGasSettings;
    if (forEstimation) {
      // Estimation deliberately uses very high internal limits and skips tx validation, so we do not
      // validate against the network admission limit here.
      fullGasSettings = GasSettings.forEstimation(gasSettingsOverrides);
    } else {
      const maxTxGasLimits = await this.getMaxTxGasLimits();
      // If the caller declared explicit gas limits, reject them up front when they exceed the network's
      // per-tx admission limit (mirroring the node's GasLimitsValidator). Otherwise fill in the limit.
      if (gasSettingsOverrides.gasLimits) {
        assertGasLimitsWithinNetworkLimits(gasSettingsOverrides.gasLimits, maxTxGasLimits);
      }
      fullGasSettings = GasSettings.fallback({
        ...gasSettingsOverrides,
        gasLimits: gasSettingsOverrides.gasLimits ?? maxTxGasLimits,
      });
    }
    this.log.debug(`Using L2 gas settings`, fullGasSettings);
    return {
      gasSettings: fullGasSettings,
      walletFeePaymentMethod: undefined,
      accountFeePaymentMethodOptions,
    };
  }

  /**
   * Returns the worst-case min fee across predicted future slots.
   * Falls back to getCurrentMinFees if the node doesn't support getPredictedMinFees.
   * @param estimate - The mana usage estimate to use for fee prediction. Defaults to Limit for conservative estimation.
   */
  protected async getMinFees(estimate: ManaUsageEstimate = ManaUsageEstimate.Limit): Promise<GasFees> {
    try {
      const predicted = await this.aztecNode.getPredictedMinFees(estimate);
      if (predicted.length === 0) {
        return this.aztecNode.getCurrentMinFees();
      }
      return predicted.reduce((worst, fees) => (fees.feePerL2Gas > worst.feePerL2Gas ? fees : worst));
    } catch (err: any) {
      // Fallback for old nodes that don't support getPredictedMinFees.
      // Only fall back on method-not-found errors (JSON-RPC code -32601); rethrow others.
      if (err?.cause?.code === -32601 || err?.message?.includes('Method not found')) {
        return this.aztecNode.getCurrentMinFees();
      }
      throw err;
    }
  }

  async registerSender(address: AztecAddress, _alias: string = ''): Promise<AztecAddress> {
    await this.pxe.registerTaggingSecretSource({ kind: 'address-derived', sender: address });
    return address;
  }

  async registerContract(
    instance: ContractInstanceWithAddress,
    artifact?: ContractArtifact,
    secretKeyOrKeys?: Fr | MasterSecretKeys,
  ): Promise<ContractInstanceWithAddress> {
    const existingInstance = await this.pxe.getContractInstance(instance.address);

    if (existingInstance) {
      // Instance already registered in the wallet
      if (artifact) {
        const thisContractClass = await getContractClassFromArtifact(artifact);
        if (!thisContractClass.id.equals(existingInstance.currentContractClassId)) {
          // wallet holds an outdated version of this contract
          await this.pxe.updateContract(instance.address, artifact);
          instance.currentContractClassId = thisContractClass.id;
        }
      }
      // If no artifact provided, we just use the existing registration
    } else {
      // Instance not registered yet
      if (!artifact) {
        // Try to get the artifact from the wallet's contract class storage
        artifact = await this.pxe.getContractArtifact(instance.currentContractClassId);
        if (!artifact) {
          throw new Error(
            `Cannot register contract at ${instance.address.toString()}: artifact is required but not provided, and wallet does not have the artifact for contract class ${instance.currentContractClassId.toString()}`,
          );
        }
      }
      await this.pxe.registerContract({ artifact, instance });
    }

    if (secretKeyOrKeys) {
      // PXE never receives the account seed (from which the message-signing/fallback secret keys could be re-derived):
      // the wallet derives the keys here. Of these, PXE only reads and stores the four privacy secret keys and the
      // message-signing and fallback *public* keys — it never touches the message-signing or fallback secret keys.
      //
      // Since PXE recomputes the address from those keys, we assert it matches the instance's address: a mismatch means
      // the provided keys don't correspond to this account.
      const derivedKeys =
        secretKeyOrKeys instanceof Fr
          ? await deriveKeys(secretKeyOrKeys)
          : await deriveKeysFromMasterSecretKeys(secretKeyOrKeys);
      const { address } = await this.pxe.registerAccount(derivedKeys, await computePartialAddress(instance));
      if (!address.equals(instance.address)) {
        throw new Error(
          `Registered account address ${address.toString()} does not match contract instance address ${instance.address.toString()}: the provided keys do not correspond to this account.`,
        );
      }
    }
    return instance;
  }

  registerContractClass(artifact: ContractArtifact): Promise<void> {
    return this.pxe.registerContractClass(artifact);
  }

  /**
   * Simulates calls through the standard PXE path (account entrypoint).
   * @param executionPayload - The execution payload to simulate.
   * @param opts - Simulation options.
   */
  protected async simulateViaEntrypoint(executionPayload: ExecutionPayload, opts: SimulateViaEntrypointOptions) {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      executionPayload,
      opts.from,
      opts.feeOptions,
    );
    const result = await this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipTxValidation: opts.skipTxValidation,
      skipFeeEnforcement: opts.skipFeeEnforcement,
      scopes: this.scopesFrom(opts.from, opts.additionalScopes),
      senderForTags: this.senderForTagsFrom(opts.from, opts.sendMessagesAs),
      overrides: opts.overrides,
    });
    const appCallOffset = await this.computeAppCallOffset(opts.from, opts.feeOptions);
    return TxSimulationResultWithAppOffset.fromResultAndOffset(result, appCallOffset);
  }

  /**
   * Computes the index where the app's calls begin in the flattened array of calls (0 = entrypoint/root, 1..N = fee
   * calls, N+1 = app).
   * @param from - The sender address, or NO_FROM for the default entrypoint.
   * @param feeOptions - Fee options containing the wallet fee payment method.
   */
  protected async computeAppCallOffset(from: AztecAddress | NoFrom, feeOptions: FeeOptions): Promise<number> {
    if (from === NO_FROM) {
      return 0;
    }
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    return (feeExecutionPayload?.calls.length ?? 0) + 1; // +1 for entrypoint
  }

  /**
   * Simulates a transaction, optimizing leading public static calls by running them directly
   * on the node while sending the remaining calls through the standard PXE path.
   * Return values from both paths are merged back in original call order.
   * @param executionPayload - The execution payload to simulate.
   * @param opts - Simulation options (from address, fee settings, etc.).
   * @returns The merged simulation result.
   */
  async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const feeOptions = await this.completeFeeOptions({
      from: opts.from,
      feePayer: executionPayload.feePayer,
      gasSettings: opts.fee?.gasSettings,
      forEstimation: true,
      congestionEstimate: opts.fee?.congestionEstimate,
    });
    const { optimizableCalls, remainingCalls } = extractOptimizablePublicStaticCalls(executionPayload);
    const remainingPayload = { ...executionPayload, calls: remainingCalls };

    const chainInfo = await this.getChainInfo();
    let blockHeader: BlockHeader;
    // PXE might not be synced yet, so we pull the latest header from the node
    // To keep things consistent, we'll always try with PXE first
    try {
      blockHeader = await this.pxe.getSyncedBlockHeader();
    } catch {
      blockHeader = (await this.aztecNode.getBlockData('latest'))!.header;
    }

    const simulationOrigin = opts.from === NO_FROM ? AztecAddress.ZERO : opts.from;
    const [optimizedResults, normalResult] = await Promise.all([
      optimizableCalls.length > 0
        ? simulateViaNode(
            this.aztecNode,
            optimizableCalls,
            simulationOrigin,
            chainInfo,
            feeOptions.gasSettings,
            blockHeader,
            opts.skipFeeEnforcement ?? true,
            this.getContractName.bind(this),
            opts.overrides,
          )
        : Promise.resolve([]),
      remainingCalls.length > 0
        ? this.simulateViaEntrypoint(remainingPayload, {
            from: opts.from,
            feeOptions,
            additionalScopes: opts.additionalScopes,
            skipTxValidation: opts.skipTxValidation,
            skipFeeEnforcement: opts.skipFeeEnforcement ?? true,
            sendMessagesAs: opts.sendMessagesAs,
            overrides: opts.overrides,
          })
        : Promise.resolve(null),
    ]);

    return buildMergedSimulationResult(optimizedResults, normalResult);
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    const feeOptions = await this.completeFeeOptions({
      from: opts.from,
      feePayer: executionPayload.feePayer,
      gasSettings: opts.fee?.gasSettings,
      congestionEstimate: opts.fee?.congestionEstimate,
    });
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    return this.pxe.profileTx(txRequest, {
      profileMode: opts.profileMode,
      skipProofGeneration: opts.skipProofGeneration ?? true,
      scopes: this.scopesFrom(opts.from, opts.additionalScopes),
      senderForTags: this.senderForTagsFrom(opts.from, opts.sendMessagesAs),
    });
  }

  public async sendTx<W extends InteractionWaitOptions = undefined>(
    executionPayload: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    const feeOptions = await this.completeFeeOptions({
      from: opts.from,
      feePayer: executionPayload.feePayer,
      gasSettings: opts.fee?.gasSettings,
      congestionEstimate: opts.fee?.congestionEstimate,
    });
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    const provenTx = await this.pxe.proveTx(txRequest, {
      scopes: this.scopesFrom(opts.from, opts.additionalScopes),
      senderForTags: this.senderForTagsFrom(opts.from, opts.sendMessagesAs),
    });
    const offchainOutput = extractOffchainOutput(
      provenTx.getOffchainEffects(),
      provenTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
    );
    const tx = await provenTx.toTx();
    const txHash = tx.getTxHash();
    if ((await this.aztecNode.getTxReceipt(txHash)).isMined()) {
      throw new Error(`A settled tx with equal hash ${txHash.toString()} exists.`);
    }
    this.log.debug(`Sending transaction ${txHash}`);
    await this.aztecNode.sendTx(tx).catch(err => {
      throw this.contextualizeError(err, inspect(tx));
    });
    this.log.info(`Sent transaction ${txHash}`);

    // If wait is NO_WAIT, return txHash immediately
    if (opts.wait === NO_WAIT) {
      return { txHash, ...offchainOutput } as SendReturn<W>;
    }

    // Otherwise, wait for the full receipt (default behavior on wait: undefined)
    const waitOpts = typeof opts.wait === 'object' ? opts.wait : undefined;
    const receipt = await waitForTx(this.aztecNode, txHash, waitOpts);

    // Display debug logs from public execution if present (served in test mode only)
    if (receipt.isMined() && receipt.debugLogs?.length) {
      await displayDebugLogs(receipt.debugLogs, this.getContractName.bind(this));
    }

    return { receipt, ...offchainOutput } as SendReturn<W>;
  }

  /**
   * Resolves a contract address to a human-readable name via PXE, if available.
   * @param address - The contract address to resolve.
   */
  protected async getContractName(address: AztecAddress): Promise<string | undefined> {
    const instance = await this.pxe.getContractInstance(address);
    if (!instance) {
      return undefined;
    }
    const artifact = await this.pxe.getContractArtifact(instance.currentContractClassId);
    return artifact?.name;
  }

  protected contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    } else {
      this.log.error(err.name, err);
      this.log.debug(contextStr);
    }
    return err;
  }

  executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions): Promise<UtilityExecutionResult> {
    return this.pxe.executeUtility(call, { authwits: opts.authWitnesses, scopes: opts.scopes });
  }

  async getPrivateEvents<T>(
    eventDef: EventMetadataDefinition,
    eventFilter: PrivateEventFilter,
  ): Promise<PrivateEvent<T>[]> {
    const pxeEvents = await this.pxe.getPrivateEvents(eventDef.eventSelector, eventFilter);

    const decodedEvents = pxeEvents.map((pxeEvent: PackedPrivateEvent): PrivateEvent<T> => {
      return {
        event: decodeFromAbi([eventDef.abiType], pxeEvent.packedEvent) as T,
        metadata: {
          l2BlockNumber: pxeEvent.l2BlockNumber,
          l2BlockHash: pxeEvent.l2BlockHash,
          txHash: pxeEvent.txHash,
        },
      };
    });

    return decodedEvents;
  }

  /**
   * Returns metadata about a contract, including whether it has been initialized, published, and updated.
   * @param address - The contract address to query.
   */
  async getContractMetadata(address: AztecAddress) {
    const instance = await this.pxe.getContractInstance(address);
    const publiclyRegisteredContractPromise = this.aztecNode.getContract(address);

    let initializationStatus: ContractInitializationStatus;
    if (instance) {
      // We have the instance, so we can compute the private initialization nullifier (which includes init_hash and is
      // emitted by both private and public initializers) and get a definitive INITIALIZED/UNINITIALIZED answer.
      const initNullifier = await computeSiloedPrivateInitializationNullifier(address, instance.initializationHash);
      const witness = await this.aztecNode.getNullifierMembershipWitness('latest', initNullifier);
      initializationStatus = witness
        ? ContractInitializationStatus.INITIALIZED
        : ContractInitializationStatus.UNINITIALIZED;
    } else {
      // Without the instance we lack the init_hash needed for the private nullifier. We fall back to checking the
      // public initialization nullifier (computed from address alone). Not all contracts emit it (only those with
      // public functions that require initialization checks), so its absence doesn't mean the contract is
      // uninitialized.
      const publicNullifier = await computeSiloedPublicInitializationNullifier(address);
      const witness = await this.aztecNode.getNullifierMembershipWitness('latest', publicNullifier);
      initializationStatus = witness ? ContractInitializationStatus.INITIALIZED : ContractInitializationStatus.UNKNOWN;
    }
    const publiclyRegisteredContract = await publiclyRegisteredContractPromise;
    const isContractUpdated =
      publiclyRegisteredContract &&
      !publiclyRegisteredContract.currentContractClassId.equals(publiclyRegisteredContract.originalContractClassId);
    return {
      instance: instance ?? undefined,
      initializationStatus,
      isContractPublished: !!publiclyRegisteredContract,
      isContractUpdated: !!isContractUpdated,
      updatedContractClassId: isContractUpdated ? publiclyRegisteredContract.currentContractClassId : undefined,
    };
  }

  async getContractClassMetadata(id: Fr) {
    const publiclyRegisteredContractClass = await this.aztecNode.getContractClass(id);
    return {
      isArtifactRegistered: !!(await this.pxe.getContractArtifact(id)),
      isContractClassPubliclyRegistered: !!publiclyRegisteredContractClass,
    };
  }
}
