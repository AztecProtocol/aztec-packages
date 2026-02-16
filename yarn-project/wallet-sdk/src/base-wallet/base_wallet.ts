import type { Account } from '@aztec/aztec.js/account';
import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import { type InteractionWaitOptions, NO_WAIT, type SendReturn } from '@aztec/aztec.js/contracts';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import { waitForTx } from '@aztec/aztec.js/node';
import type {
  Aliased,
  AppCapabilities,
  BatchResults,
  BatchedMethod,
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
import type { PXE, PackedPrivateEvent } from '@aztec/pxe/server';
import {
  type ContractArtifact,
  type EventMetadataDefinition,
  type FunctionCall,
  decodeFromAbi,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
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
  type TxProfileResult,
  TxSimulationResult,
  type UtilitySimulationResult,
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
   */
  protected async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
  ) {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, from, feeOptions);
    return this.pxe.simulateTx(txRequest, { simulatePublic: true, skipTxValidation, skipFeeEnforcement });
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
          )
        : Promise.resolve([]),
      remainingCalls.length > 0
        ? this.simulateViaEntrypoint(
            remainingPayload,
            opts.from,
            feeOptions,
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
    });
  }

  public async sendTx<W extends InteractionWaitOptions = undefined>(
    executionPayload: ExecutionPayload,
    opts: SendOptions<W>,
  ): Promise<SendReturn<W>> {
    const feeOptions = await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    const provenTx = await this.pxe.proveTx(txRequest);
    const tx = await provenTx.toTx();
    const txHash = tx.getTxHash();
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
      return txHash as SendReturn<W>;
    }

    // Otherwise, wait for the full receipt (default behavior on wait: undefined)
    const waitOpts = typeof opts.wait === 'object' ? opts.wait : undefined;
    return (await waitForTx(this.aztecNode, txHash, waitOpts)) as SendReturn<W>;
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

  simulateUtility(call: FunctionCall, authwits?: AuthWitness[]): Promise<UtilitySimulationResult> {
    return this.pxe.simulateUtility(call, { authwits });
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
