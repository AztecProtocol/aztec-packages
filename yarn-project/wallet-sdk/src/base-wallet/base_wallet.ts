import type { Account } from '@aztec/aztec.js/account';
import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import {
  type InteractionWaitOptions,
  NO_WAIT,
  type OffchainMessage,
  type SendReturn,
  extractOffchainOutput,
} from '@aztec/aztec.js/contracts';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { waitForTx } from '@aztec/aztec.js/node';
import type {
  Aliased,
  AppCapabilities,
  BatchResults,
  BatchedMethod,
  ExecuteUtilityOptions,
  PrivateEvent,
  PrivateEventFilter,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  Wallet,
  WalletCapabilities,
} from '@aztec/aztec.js/wallet';
import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
} from '@aztec/constants';
import { AccountFeePaymentMethodOptions, type DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import { type AccessScopes, displayDebugLogs } from '@aztec/pxe/client/lazy';
import type { PXE, PackedPrivateEvent } from '@aztec/pxe/server';
import {
  type ContractArtifact,
  type EventMetadataDefinition,
  type FunctionAbi,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  decodeFromAbi,
  encodeArguments,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  computePartialAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import {
  BlockHeader,
  type TxExecutionRequest,
  type TxHash,
  type TxProfileResult,
  TxSimulationResult,
  type UtilityExecutionResult,
} from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import { inspect } from 'util';

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
  accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions;
  /** The gas settings to use for the transaction */
  gasSettings: GasSettings;
};

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  protected minFeePadding = 0.5;
  protected cancellableTransactions = false;

  // Protected because we want to force wallets to instantiate their own PXE.
  protected constructor(
    protected readonly pxe: PXE,
    protected readonly aztecNode: AztecNode,
    protected log = createLogger('wallet-sdk:base_wallet'),
  ) {}

  protected scopesFrom(from: AztecAddress, additionalScopes: AztecAddress[] = []): AztecAddress[] {
    const allScopes = from.isZero() ? additionalScopes : [from, ...additionalScopes];
    const scopeSet = new Set(allScopes.map(address => address.toString()));
    return [...scopeSet].map(AztecAddress.fromString);
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
    const senders: AztecAddress[] = await this.pxe.getSenders();
    return senders.map(sender => ({ item: sender, alias: '' }));
  }

  async getChainInfo(): Promise<ChainInfo> {
    const { l1ChainId, rollupVersion } = await this.aztecNode.getNodeInfo();
    return { chainId: new Fr(l1ChainId), version: new Fr(rollupVersion) };
  }

  protected async createTxExecutionRequestFromPayloadAndFee(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
  ): Promise<TxExecutionRequest> {
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const fromAccount = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    return fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
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
   * @param from - The address where the transaction is being sent from
   * @param feePayer - The address paying for fees (if any fee payment method is embedded in the execution payload)
   * @param gasSettings - User-provided partial gas settings
   * @returns - Complete fee options that can be used to create a transaction execution request
   */
  protected async completeFeeOptions(
    from: AztecAddress,
    feePayer?: AztecAddress,
    gasSettings?: Partial<FieldsOf<GasSettings>>,
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      gasSettings?.maxFeesPerGas ?? (await this.aztecNode.getCurrentMinFees()).mul(1 + this.minFeePadding);
    let accountFeePaymentMethodOptions;
    // The transaction does not include a fee payment method, so we set the flag
    // for the account to use its fee juice balance
    if (!feePayer) {
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE;
    } else {
      // The transaction includes fee payment method, so we check if we are the fee payer for it
      // (this can only happen if the embedded payment method is FeeJuiceWithClaim)
      accountFeePaymentMethodOptions = from.equals(feePayer)
        ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
        : AccountFeePaymentMethodOptions.EXTERNAL;
    }
    const fullGasSettings: GasSettings = GasSettings.default({ ...gasSettings, maxFeesPerGas });
    this.log.debug(`Using L2 gas settings`, fullGasSettings);
    return {
      gasSettings: fullGasSettings,
      walletFeePaymentMethod: undefined,
      accountFeePaymentMethodOptions,
    };
  }

  /**
   * Completes partial user-provided fee options with unreasonably high gas limits
   * for gas estimation. Uses the same logic as completeFeeOptions but sets high limits
   * to avoid running out of gas during estimation.
   * @param from - The address where the transaction is being sent from
   * @param feePayer - The address paying for fees (if any fee payment method is embedded in the execution payload)
   * @param gasSettings - User-provided partial gas settings
   */
  protected async completeFeeOptionsForEstimation(
    from: AztecAddress,
    feePayer?: AztecAddress,
    gasSettings?: Partial<FieldsOf<GasSettings>>,
  ) {
    const defaultFeeOptions = await this.completeFeeOptions(from, feePayer, gasSettings);
    const {
      gasSettings: { maxFeesPerGas, maxPriorityFeesPerGas },
    } = defaultFeeOptions;
    // Use unrealistically high gas limits for estimation to avoid running out of gas.
    // They will be tuned down after the simulation.
    const gasSettingsForEstimation = new GasSettings(
      new Gas(GAS_ESTIMATION_DA_GAS_LIMIT, GAS_ESTIMATION_L2_GAS_LIMIT),
      new Gas(GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT, GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT),
      maxFeesPerGas,
      maxPriorityFeesPerGas,
    );
    return {
      ...defaultFeeOptions,
      gasSettings: gasSettingsForEstimation,
    };
  }

  registerSender(address: AztecAddress, _alias: string = ''): Promise<AztecAddress> {
    return this.pxe.registerSender(address);
  }

  async registerContract(
    instance: ContractInstanceWithAddress,
    artifact?: ContractArtifact,
    secretKey?: Fr,
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

    if (secretKey) {
      await this.pxe.registerAccount(secretKey, await computePartialAddress(instance));
    }
    return instance;
  }

  /**
   * Simulates calls through the standard PXE path (account entrypoint).
   * @param executionPayload - The execution payload to simulate.
   * @param from - The sender address.
   * @param feeOptions - Fee options for the transaction.
   * @param skipTxValidation - Whether to skip tx validation.
   * @param skipFeeEnforcement - Whether to skip fee enforcement.
   * @param scopes - The scopes to use for the simulation.
   */
  protected async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
    scopes: AccessScopes,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ) {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, from, feeOptions);
    return this.pxe.simulateTx(txRequest, { simulatePublic: true, skipTxValidation, skipFeeEnforcement, scopes });
  }

  /**
   * Simulates a transaction, optimizing leading public static calls by running them directly
   * on the node while sending the remaining calls through the standard PXE path.
   * Return values from both paths are merged back in original call order.
   * @param executionPayload - The execution payload to simulate.
   * @param opts - Simulation options (from address, fee settings, etc.).
   * @returns The merged simulation result.
   */
  async simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult> {
    const feeOptions = opts.fee?.estimateGas
      ? await this.completeFeeOptionsForEstimation(opts.from, executionPayload.feePayer, opts.fee?.gasSettings)
      : await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const { optimizableCalls, remainingCalls } = extractOptimizablePublicStaticCalls(executionPayload);
    const remainingPayload = { ...executionPayload, calls: remainingCalls };

    const chainInfo = await this.getChainInfo();
    let blockHeader: BlockHeader;
    // PXE might not be synced yet, so we pull the latest header from the node
    // To keep things consistent, we'll always try with PXE first
    try {
      blockHeader = await this.pxe.getSyncedBlockHeader();
    } catch {
      blockHeader = (await this.aztecNode.getBlockHeader())!;
    }

    const [optimizedResults, normalResult] = await Promise.all([
      optimizableCalls.length > 0
        ? simulateViaNode(
            this.aztecNode,
            optimizableCalls,
            opts.from,
            chainInfo,
            feeOptions.gasSettings,
            blockHeader,
            opts.skipFeeEnforcement ?? true,
            this.getContractName.bind(this),
          )
        : Promise.resolve([]),
      remainingCalls.length > 0
        ? this.simulateViaEntrypoint(
            remainingPayload,
            opts.from,
            feeOptions,
            this.scopesFrom(opts.from, opts.additionalScopes),
            opts.skipTxValidation,
            opts.skipFeeEnforcement ?? true,
          )
        : Promise.resolve(null),
    ]);

    return buildMergedSimulationResult(optimizedResults, normalResult);
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    const feeOptions = await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    return this.pxe.profileTx(txRequest, {
      profileMode: opts.profileMode,
      skipProofGeneration: opts.skipProofGeneration ?? true,
      scopes: this.scopesFrom(opts.from, opts.additionalScopes),
    });
  }

  public async sendTx<W extends InteractionWaitOptions = undefined>(
    executionPayload: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    const feeOptions = await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    const provenTx = await this.pxe.proveTx(txRequest, this.scopesFrom(opts.from, opts.additionalScopes));
    const offchainOutput = extractOffchainOutput(
      provenTx.getOffchainEffects(),
      provenTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
    );
    const tx = await provenTx.toTx();
    const txHash = tx.getTxHash();
    // Self-deliver offchain messages addressed to registered accounts before sending to the network.
    // This ensures the PXE's offchain inbox has the messages as early as possible.
    await this.selfDeliverOffchainMessages(offchainOutput.offchainMessages, opts.from, txHash);
    if (await this.aztecNode.getTxEffect(txHash)) {
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
    if (receipt.debugLogs?.length) {
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

  /**
   * Delivers offchain messages addressed to any of this wallet's registered accounts.
   *
   * It does so by calling the contract's `offchain_receive` utility function. This avoids requiring the sender to
   * manually deliver their own change notes or other self-addressed messages. Messages for different recipients
   * within the same contract are batched into a single call since `offchain_receive` routes each message by its
   * `recipient` field internally.
   * @param offchainMessages - Messages to filter and deliver.
   * @param scope - The scope (caller) to use for `offchain_receive` utility execution.
   * @param txHash - Hash of the originating transaction, if available.
   */
  private async selfDeliverOffchainMessages(
    offchainMessages: OffchainMessage[],
    scope: AztecAddress,
    txHash?: TxHash,
  ): Promise<void> {
    if (offchainMessages.length === 0) {
      return;
    }

    const localAccounts = new Set((await this.getAccounts()).map(a => a.item.toString()));

    const selfMessages = offchainMessages.filter(msg => localAccounts.has(msg.recipient.toString()));
    if (selfMessages.length === 0) {
      return;
    }

    // Group messages by contract, each group becomes one `offchain_receive` call.
    // The Noir `receive` function routes each message to the correct recipient's inbox internally.
    const messagesByContract = new Map<string, OffchainMessage[]>();
    for (const msg of selfMessages) {
      const key = msg.contractAddress.toString();
      const group = messagesByContract.get(key) ?? [];
      group.push(msg);
      messagesByContract.set(key, group);
    }

    // Call `offchain_messages` once per emitting contract
    for (const contractMsgs of messagesByContract.values()) {
      const { contractAddress } = contractMsgs[0];
      const fnAbi = await this.getOffchainReceiveAbi(contractAddress);

      // Defensive, since contracts with no `offchain_receive` function should also not emit, but the check is cheap
      if (!fnAbi) {
        this.log.verbose(`Contract ${contractAddress} has no offchain_receive function, skipping self-delivery`);
        continue;
      }

      // Field names must match the Noir struct (snake_case) for ABI encoding.
      const jsMessages = contractMsgs.map(msg => ({
        ciphertext: msg.payload,
        recipient: msg.recipient,
        tx_hash: txHash?.hash, // eslint-disable-line camelcase
        anchor_block_timestamp: msg.anchorBlockTimestamp, // eslint-disable-line camelcase
      }));
      const args = encodeArguments(fnAbi, [jsMessages]);
      const selector = await FunctionSelector.fromNameAndParameters(fnAbi.name, fnAbi.parameters);

      const call = FunctionCall.from({
        name: 'offchain_receive',
        to: contractAddress,
        selector,
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: fnAbi.isStatic,
        args,
        returnTypes: [],
      });

      this.log.verbose(`Self-delivering ${contractMsgs.length} offchain message(s) on ${contractAddress}`);
      await this.pxe.executeUtility(call, { scopes: [scope] });
    }
  }

  /**
   * Looks up the `offchain_receive` function ABI from a contract's artifact.
   * @param contractAddress - The contract to look up.
   */
  private async getOffchainReceiveAbi(contractAddress: AztecAddress): Promise<FunctionAbi | undefined> {
    const instance = await this.pxe.getContractInstance(contractAddress);
    if (!instance) {
      return undefined;
    }
    const artifact = await this.pxe.getContractArtifact(instance.currentContractClassId);
    if (!artifact) {
      return undefined;
    }
    return artifact.functions.find(f => f.name === 'offchain_receive');
  }

  async executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions): Promise<UtilityExecutionResult> {
    const result = await this.pxe.executeUtility(call, { authwits: opts.authWitnesses, scopes: [opts.scope] });

    // Self-deliver offchain messages from utility execution, but skip for offchain_receive itself to avoid recursion.
    // Defensive, as `offchain_receive` shouldn't ever emit offchain messages.
    if (call.name !== 'offchain_receive' && result.offchainEffects.length > 0) {
      const offchainOutput = extractOffchainOutput(result.offchainEffects, result.anchorBlockTimestamp);
      await this.selfDeliverOffchainMessages(offchainOutput.offchainMessages, opts.scope);
    }

    return result;
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

  async getContractMetadata(address: AztecAddress) {
    const instance = await this.pxe.getContractInstance(address);
    const initNullifier = await siloNullifier(address, address.toField());
    const publiclyRegisteredContract = await this.aztecNode.getContract(address);
    const initNullifierMembershipWitness = await this.aztecNode.getNullifierMembershipWitness('latest', initNullifier);
    const isContractUpdated =
      publiclyRegisteredContract &&
      !publiclyRegisteredContract.currentContractClassId.equals(publiclyRegisteredContract.originalContractClassId);
    return {
      instance: instance ?? undefined,
      isContractInitialized: !!initNullifierMembershipWitness,
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
