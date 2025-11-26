import type { Account } from '@aztec/aztec.js/account';
import type { CallIntent, IntentInnerHash } from '@aztec/aztec.js/authorization';
import type { FeePaymentMethod } from '@aztec/aztec.js/fee';
import type {
  Aliased,
  BatchResults,
  BatchableMethods,
  BatchedMethod,
  ProfileOptions,
  SendOptions,
  SimulateOptions,
  Wallet,
} from '@aztec/aztec.js/wallet';
import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
} from '@aztec/constants';
import { AccountFeePaymentMethodOptions, type DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { ChainInfo } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import type { PXE } from '@aztec/pxe/server';
import {
  type ContractArtifact,
  type EventMetadataDefinition,
  type FunctionCall,
  decodeFromAbi,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClassMetadata,
  type ContractInstanceWithAddress,
  type ContractMetadata,
  computePartialAddress,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type {
  TxExecutionRequest,
  TxHash,
  TxProfileResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import { inspect } from 'util';

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
  protected log = createLogger('wallet-sdk:base_wallet');

  protected baseFeePadding = 0.5;
  protected cancellableTransactions = false;

  // Protected because we want to force wallets to instantiate their own PXE.
  protected constructor(
    protected readonly pxe: PXE,
    protected readonly aztecNode: AztecNode,
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
    return fromAccount.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, executionOptions);
  }

  public async createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | IntentInnerHash | CallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    return account.createAuthWit(messageHashOrIntent);
  }

  public async batch<const T extends readonly BatchedMethod<keyof BatchableMethods>[]>(
    methods: T,
  ): Promise<BatchResults<T>> {
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
      gasSettings?.maxFeesPerGas ?? (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.baseFeePadding);
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
    const { contractInstance: existingInstance } = await this.pxe.getContractMetadata(instance.address);

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
        const classMetadata = await this.pxe.getContractClassMetadata(instance.currentContractClassId, true);
        if (!classMetadata.artifact) {
          throw new Error(
            `Cannot register contract at ${instance.address.toString()}: artifact is required but not provided, and wallet does not have the artifact for contract class ${instance.currentContractClassId.toString()}`,
          );
        }
        artifact = classMetadata.artifact;
      }
      await this.pxe.registerContract({ artifact, instance });
    }

    if (secretKey) {
      await this.pxe.registerAccount(secretKey, await computePartialAddress(instance));
    }
    return instance;
  }

  async simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult> {
    const feeOptions = opts.fee?.estimateGas
      ? await this.completeFeeOptionsForEstimation(opts.from, executionPayload.feePayer, opts.fee?.gasSettings)
      : await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      opts?.skipTxValidation,
      opts?.skipFeeEnforcement ?? true,
    );
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions): Promise<TxProfileResult> {
    const feeOptions = await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, feeOptions);
    return this.pxe.profileTx(txRequest, opts.profileMode, opts.skipProofGeneration ?? true);
  }

  async sendTx(executionPayload: ExecutionPayload, opts: SendOptions): Promise<TxHash> {
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
    return txHash;
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
    return this.pxe.simulateUtility(call, authwits);
  }

  getContractClassMetadata(id: Fr, includeArtifact: boolean = false): Promise<ContractClassMetadata> {
    return this.pxe.getContractClassMetadata(id, includeArtifact);
  }
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return this.pxe.getContractMetadata(address);
  }

  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.aztecNode.getTxReceipt(txHash);
  }

  async getPrivateEvents<T>(
    contractAddress: AztecAddress,
    eventDef: EventMetadataDefinition,
    from: number,
    limit: number,
    recipients: AztecAddress[] = [],
  ): Promise<T[]> {
    const events = await this.pxe.getPrivateEvents(contractAddress, eventDef.eventSelector, from, limit, recipients);

    const decodedEvents = events.map(
      (event: any /** PrivateEvent */): T => decodeFromAbi([eventDef.abiType], event.packedEvent) as T,
    );

    return decodedEvents;
  }
}
