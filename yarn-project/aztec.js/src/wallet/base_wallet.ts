import type { FeeOptions, TxExecutionOptions, UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstanceWithAddress, NodeInfo } from '@aztec/stdlib/contract';
import { type GasFees, GasSettings } from '@aztec/stdlib/gas';
import type {
  ContractClassMetadata,
  ContractMetadata,
  EventMetadataDefinition,
  PXE,
  PXEInfo,
} from '@aztec/stdlib/interfaces/client';
import type {
  PrivateExecutionResult,
  SimulationOverrides,
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
import { getGasLimits } from '../contract/get_gas_limits.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { Wallet } from './wallet.js';

/**
 * A base class for Wallet implementations
 */
export abstract class BaseWallet implements Wallet {
  protected log = createLogger('aztecjs:base_wallet');

  constructor(protected readonly pxe: PXE) {}

  protected abstract getAccounFromAddress(address: AztecAddress): Promise<Account>;

  private async createTxExecutionRequestFromPayloadAndFee(
    from: AztecAddress,
    executionPayload: ExecutionPayload,
    userFee?: UserFeeOptions,
  ): Promise<TxExecutionRequest> {
    const executionOptions = { txNonce: Fr.random(), cancellable: true };
    const fromAccount = await this.getAccounFromAddress(from);
    const fee = await this.getFeeOptions(fromAccount, executionPayload, userFee, executionOptions);
    return await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
  }

  // docs:start:estimateGas
  /**
   * Estimates gas for a given tx request and returns gas limits for it.
   * @param opts - Options.
   * @param pad - Percentage to pad the suggested gas limits by, if empty, defaults to 10%.
   * @returns Gas limits.
   */
  public async estimateGas(
    executionPayload: ExecutionPayload,
    opts: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> {
    // docs:end:estimateGas
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(opts.from, executionPayload, opts.fee);
    const simulationResult = await this.pxe.simulateTx(
      txRequest,
      true /*simulatePublic*/,
      undefined /* skipTxValidation */,
      true /* skipFeeEnforcement */,
    );
    const { totalGas: gasLimits, teardownGas: teardownGasLimits } = getGasLimits(
      simulationResult,
      opts?.fee?.estimatedGasPadding,
    );
    return { gasLimits, teardownGasLimits };
  }

  /**
   * Returns default fee options based on the user opts without running a simulation for gas estimation.
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
   * @param executionPayload - Execution payload to get the fee for
   * @param fee - User-provided fee options.
   * @param options - Additional options for the transaction. They must faithfully represent the tx to get accurate fee estimates
   * @returns Fee options for the actual transaction.
   */
  private async getFeeOptions(
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
      const feeForEstimation: FeeOptions = { paymentMethod, gasSettings };
      const txRequest = await account.createTxExecutionRequest(executionPayload, feeForEstimation, options);
      const simulationResult = await this.pxe.simulateTx(
        txRequest,
        true /*simulatePublic*/,
        undefined /* skipTxValidation */,
        true /* skipFeeEnforcement */,
      );
      const { totalGas: gasLimits, teardownGas: teardownGasLimits } = getGasLimits(
        simulationResult,
        fee?.estimatedGasPadding,
      );
      gasSettings = GasSettings.from({ maxFeesPerGas, maxPriorityFeesPerGas, gasLimits, teardownGasLimits });
      this.log.verbose(
        `Estimated gas limits for tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
      );
    }

    return { gasSettings, paymentMethod };
  }

  registerSender(address: AztecAddress): Promise<AztecAddress> {
    return this.pxe.registerSender(address);
  }

  registerContract(contract: {
    /** Instance */ instance: ContractInstanceWithAddress;
    /** Associated artifact */ artifact?: ContractArtifact;
  }): Promise<void> {
    return this.pxe.registerContract(contract);
  }

  registerContractClass(artifact: ContractArtifact): Promise<void> {
    return this.pxe.registerContractClass(artifact);
  }

  updateContract(contractAddress: AztecAddress, artifact: ContractArtifact): Promise<void> {
    return this.pxe.updateContract(contractAddress, artifact);
  }

  async simulateTx(executionPayload: ExecutionPayload, opts: SimulateMethodOptions): Promise<TxSimulationResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(opts.from, executionPayload, opts.fee);
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      opts.skipTxValidation,
      opts.skipFeeEnforcement ?? true,
    );
  }

  async profileTx(executionPayload: ExecutionPayload, opts: ProfileMethodOptions): Promise<TxProfileResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(opts.from, executionPayload, opts.fee);
    return this.pxe.profileTx(txRequest, opts.profileMode, opts.skipProofGeneration ?? true);
  }

  async proveTx(exec: ExecutionPayload, opts: SendMethodOptions): Promise<TxProvingResult> {
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(opts.from, exec, opts.fee);
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
