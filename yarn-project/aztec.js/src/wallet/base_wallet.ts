import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT,
  GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT,
} from '@aztec/constants';
import type { FeeOptions, TxExecutionOptions, UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  type ContractInstantiationData,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import type {
  ContractClassMetadata,
  ContractMetadata,
  EventMetadataDefinition,
  PXE,
} from '@aztec/stdlib/interfaces/client';
import type {
  Tx,
  TxExecutionRequest,
  TxHash,
  TxProfileResult,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import type { Account } from '../account/account.js';
import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getGasLimits } from '../contract/get_gas_limits.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';
import type { Aliased, ContractInstanceAndArtifact, Wallet } from './wallet.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  protected log = createLogger('aztecjs:base_wallet');

  constructor(protected readonly pxe: PXE) {}

  protected abstract getAccountFromAddress(address: AztecAddress): Promise<Account>;

  abstract getAccounts(): Promise<Aliased<AztecAddress>[]>;

  async getSenders(): Promise<Aliased<AztecAddress>[]> {
    const senders = await this.pxe.getSenders();
    return senders.map(sender => ({ item: sender, alias: '' }));
  }

  protected async createTxExecutionRequestFromPayloadAndFee(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    userFee?: UserFeeOptions,
  ): Promise<TxExecutionRequest> {
    const executionOptions = { txNonce: Fr.random(), cancellable: false };
    const fromAccount = await this.getAccountFromAddress(from);
    const fee = await this.getFeeOptions(fromAccount, executionPayload, userFee, executionOptions);
    return await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
  }

  public async createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    return account.createAuthWit(messageHashOrIntent);
  }

  public async setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
    authorized: boolean,
  ): Promise<ContractFunctionInteraction> {
    const account = await this.getAccountFromAddress(from);
    return account.setPublicAuthWit(this, messageHashOrIntent, authorized);
  }

  // docs:start:estimateGas
  /**
   * Estimates gas for a given tx request and returns gas limits for it.
   * @param executionPayload - The execution payload to calculate the gas for
   * @param opts - Options.
   * @returns Gas limits.
   */
  public async estimateGas(
    executionPayload: ExecutionPayload,
    opts: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> {
    // docs:end:estimateGas
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, {
      ...opts.fee,
      estimateGas: true,
    });
    return {
      gasLimits: txRequest.txContext.gasSettings.gasLimits,
      teardownGasLimits: txRequest.txContext.gasSettings.teardownGasLimits,
    };
  }

  /**
   * Returns default fee options based on the user opts without running a simulation for gas estimation.
   * @param account - The account requesting the fee options
   * @param fee - User-provided fee options.
   */
  private async getDefaultFeeOptions(account: Account, fee: UserFeeOptions | undefined): Promise<FeeOptions> {
    const maxFeesPerGas =
      fee?.gasSettings?.maxFeesPerGas ?? (await this.pxe.getCurrentBaseFees()).mul(1 + (fee?.baseFeePadding ?? 0.5));
    const paymentMethod = fee?.paymentMethod ?? new FeeJuicePaymentMethod(account.getAddress());
    const gasSettings: GasSettings = GasSettings.default({ ...fee?.gasSettings, maxFeesPerGas });
    this.log.debug(`Using L2 gas settings`, gasSettings);
    return { gasSettings, paymentMethod };
  }

  // docs:start:getFeeOptions
  /**
   * Return fee options based on the user opts, estimating tx gas if needed.
   * @param account - The account requesting the fee options
   * @param executionPayload - Execution payload to get the fee for
   * @param fee - User-provided fee options.
   * @param options - Additional options for the transaction. They must faithfully represent the tx to get accurate fee estimates
   * @returns Fee options for the actual transaction.
   */
  protected async getFeeOptions(
    account: Account,
    executionPayload: ExecutionPayload,
    fee: UserFeeOptions = {},
    options: TxExecutionOptions,
  ): Promise<FeeOptions> {
    // docs:end:getFeeOptions
    const defaultFeeOptions = await this.getDefaultFeeOptions(account, fee);
    const paymentMethod = defaultFeeOptions.paymentMethod;
    const maxFeesPerGas = defaultFeeOptions.gasSettings.maxFeesPerGas;
    const maxPriorityFeesPerGas = defaultFeeOptions.gasSettings.maxPriorityFeesPerGas;

    let gasSettings = defaultFeeOptions.gasSettings;
    if (fee?.estimateGas) {
      // Use unrealistically high gas limits for estimation to avoid running out of gas.
      // They will be tuned down after the simulation.
      const gasSettingsForEstimation = new GasSettings(
        new Gas(GAS_ESTIMATION_DA_GAS_LIMIT, GAS_ESTIMATION_L2_GAS_LIMIT),
        new Gas(GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT, GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT),
        maxFeesPerGas,
        maxPriorityFeesPerGas,
      );
      const feeForEstimation: FeeOptions = { paymentMethod, gasSettings: gasSettingsForEstimation };
      const txRequest = await account.createTxExecutionRequest(executionPayload, feeForEstimation, options);
      const simulationResult = await this.pxe.simulateTx(
        txRequest,
        true /*simulatePublic*/,
        undefined /* skipTxValidation */,
        true /* skipFeeEnforcement */,
      );
      const { gasLimits, teardownGasLimits } = getGasLimits(simulationResult, fee?.estimatedGasPadding);
      gasSettings = GasSettings.from({ maxFeesPerGas, maxPriorityFeesPerGas, gasLimits, teardownGasLimits });
      this.log.verbose(
        `Estimated gas limits for tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
      );
    }

    return { gasSettings, paymentMethod };
  }

  registerSender(address: AztecAddress, _alias: string): Promise<AztecAddress> {
    return this.pxe.registerSender(address);
  }

  async registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
  ): Promise<ContractInstanceWithAddress> {
    /**
     * Determes if the provided instance data is already a contract instance with an address.
     */
    function isInstanceWithAddress(instanceData: any): instanceData is ContractInstanceWithAddress {
      return (instanceData as ContractInstanceWithAddress).address !== undefined;
    }
    /**
     * Determes if the provided instance data is contract instantiation data.
     */
    function isContractInstantiationData(instanceData: any): instanceData is ContractInstantiationData {
      return (instanceData as ContractInstantiationData).salt !== undefined;
    }
    /**
     * Determes if the provided instance data is already a contract.
     */
    function isContractInstanceAndArtifact(instanceData: any): instanceData is ContractInstanceAndArtifact {
      return (
        (instanceData as ContractInstanceAndArtifact).instance !== undefined &&
        (instanceData as ContractInstanceAndArtifact).artifact !== undefined
      );
    }
    let instance: ContractInstanceWithAddress;
    if (isContractInstanceAndArtifact(instanceData)) {
      instance = instanceData.instance;
      await this.pxe.registerContract(instanceData);
    } else if (isInstanceWithAddress(instanceData)) {
      instance = instanceData;
      await this.pxe.registerContract({ artifact, instance });
    } else if (isContractInstantiationData(instanceData)) {
      if (!artifact) {
        throw new Error(`Contract artifact must be provided when registering a contract using instantiation data`);
      }
      instance = await getContractInstanceFromInstantiationParams(artifact, instanceData);
      await this.pxe.registerContract({ artifact, instance });
    } else {
      if (!artifact) {
        throw new Error(`Contract artifact must be provided when registering a contract using address`);
      }
      const { contractInstance: maybeContractInstance } = await this.pxe.getContractMetadata(instanceData);
      if (!maybeContractInstance) {
        throw new Error(`Contract instance at ${instanceData.toString()} has not been registered in the wallet's PXE`);
      }
      instance = maybeContractInstance;
      const thisContractClass = await getContractClassFromArtifact(artifact);
      if (!thisContractClass.id.equals(instance.currentContractClassId)) {
        // wallet holds an outdated version of this contract
        await this.pxe.updateContract(instance.address, artifact);
        instance.currentContractClassId = thisContractClass.id;
      }
    }
    return instance;
  }

  async simulateTx(executionPayload: ExecutionPayload, opts: SimulateMethodOptions): Promise<TxSimulationResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, opts.fee);
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      opts?.skipTxValidation,
      opts?.skipFeeEnforcement ?? true,
    );
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileMethodOptions): Promise<TxProfileResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(executionPayload, opts.from, opts.fee);
    return this.pxe.profileTx(txRequest, opts.profileMode, opts.skipProofGeneration ?? true);
  }

  async proveTx(exec: ExecutionPayload, opts: SendMethodOptions): Promise<TxProvingResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(exec, opts.from, opts.fee);
    return this.pxe.proveTx(txRequest);
  }

  sendTx(tx: Tx): Promise<TxHash> {
    return this.pxe.sendTx(tx);
  }

  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress,
  ): Promise<UtilitySimulationResult> {
    return this.pxe.simulateUtility(functionName, args, to, authwits, from);
  }

  getContractClassMetadata(id: Fr, includeArtifact: boolean = false): Promise<ContractClassMetadata> {
    return this.pxe.getContractClassMetadata(id, includeArtifact);
  }
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return this.pxe.getContractMetadata(address);
  }

  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return this.pxe.getTxReceipt(txHash);
  }

  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    event: EventMetadataDefinition,
    from: number,
    limit: number,
    recipients: AztecAddress[] = [],
  ): Promise<T[]> {
    return this.pxe.getPrivateEvents(contractAddress, event, from, limit, recipients);
  }
  getPublicEvents<T>(event: EventMetadataDefinition, from: number, limit: number): Promise<T[]> {
    return this.pxe.getPublicEvents(event, from, limit);
  }
}
