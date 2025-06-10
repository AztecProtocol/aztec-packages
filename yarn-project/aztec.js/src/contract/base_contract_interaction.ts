import type { FeeOptions, TxExecutionOptions, UserFeeOptions } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { GasSettings } from '@aztec/stdlib/gas';
import type { Capsule, TxExecutionRequest, TxProvingResult } from '@aztec/stdlib/tx';

import { FeeJuicePaymentMethod } from '../fee/fee_juice_payment_method.js';
import type { Wallet } from '../wallet/wallet.js';
import { getGasLimits } from './get_gas_limits.js';
import type { RequestMethodOptions, SendMethodOptions } from './interaction_options.js';
import { ProvenTx } from './proven_tx.js';
import { SentTx } from './sent_tx.js';

/**
 * Base class for an interaction with a contract, be it a deployment, a function call, or a batch.
 * Implements the sequence create/simulate/send.
 */
export abstract class BaseContractInteraction {
  protected log = createLogger('aztecjs:contract_interaction');

  constructor(
    protected wallet: Wallet,
    protected authWitnesses: AuthWitness[] = [],
    protected capsules: Capsule[] = [],
  ) {}

  /**
   * Create a transaction execution request ready to be simulated.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A transaction execution request.
   */
  public abstract create(options?: SendMethodOptions): Promise<TxExecutionRequest>;

  /**
   * Returns an execution request that represents this operation.
   * Can be used as a building block for constructing batch requests.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public abstract request(options?: RequestMethodOptions): Promise<ExecutionPayload>;

  /**
   * Creates a transaction execution request, simulates and proves it. Differs from .prove in
   * that its result does not include the wallet nor the composed tx object, but only the proving result.
   * This object can then be used to either create a ProvenTx ready to be sent, or directly send the transaction.
   * @param options - optional arguments to be used in the creation of the transaction
   * @returns The proving result.
   */
  protected async proveInternal(options: SendMethodOptions = {}): Promise<TxProvingResult> {
    const txRequest = await this.create(options);
    return await this.wallet.proveTx(txRequest);
  }

  // docs:start:prove
  /**
   * Proves a transaction execution request and returns a tx object ready to be sent.
   * @param options - optional arguments to be used in the creation of the transaction
   * @returns The resulting transaction
   */
  public async prove(options: SendMethodOptions = {}): Promise<ProvenTx> {
    // docs:end:prove
    const txProvingResult = await this.proveInternal(options);
    return new ProvenTx(
      this.wallet,
      txProvingResult.toTx(),
      txProvingResult.getOffchainMessages(),
      txProvingResult.stats,
    );
  }

  // docs:start:send
  /**
   * Sends a transaction to the contract function with the specified options.
   * This function throws an error if called on a utility function.
   * It creates and signs the transaction if necessary, and returns a SentTx instance,
   * which can be used to track the transaction status, receipt, and events.
   * @param options - An optional object containing 'from' property representing
   * the AztecAddress of the sender. If not provided, the default address is used.
   * @returns A SentTx instance for tracking the transaction status and information.
   */
  public send(options: SendMethodOptions = {}): SentTx {
    // docs:end:send
    const sendTx = async () => {
      const txProvingResult = await this.proveInternal(options);
      return this.wallet.sendTx(txProvingResult.toTx());
    };
    return new SentTx(this.wallet, sendTx);
  }

  // docs:start:estimateGas
  /**
   * Estimates gas for a given tx request and returns gas limits for it.
   * @param opts - Options.
   * @param pad - Percentage to pad the suggested gas limits by, if empty, defaults to 10%.
   * @returns Gas limits.
   */
  public async estimateGas(
    opts?: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> {
    // docs:end:estimateGas
    const txRequest = await this.create({ ...opts, fee: { ...opts?.fee, estimateGas: false } });
    const simulationResult = await this.wallet.simulateTx(
      txRequest,
      true /*simulatePublic*/,
      undefined /* msgSender */,
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
  protected async getDefaultFeeOptions(fee: UserFeeOptions | undefined): Promise<FeeOptions> {
    const maxFeesPerGas =
      fee?.gasSettings?.maxFeesPerGas ?? (await this.wallet.getCurrentBaseFees()).mul(1 + (fee?.baseFeePadding ?? 0.5));
    const paymentMethod = fee?.paymentMethod ?? new FeeJuicePaymentMethod(this.wallet.getAddress());
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
  protected async getFeeOptions(
    executionPayload: ExecutionPayload,
    fee: UserFeeOptions = {},
    options: TxExecutionOptions,
  ): Promise<FeeOptions> {
    // docs:end:getFeeOptions
    const defaultFeeOptions = await this.getDefaultFeeOptions(fee);
    const paymentMethod = defaultFeeOptions.paymentMethod;
    const maxFeesPerGas = defaultFeeOptions.gasSettings.maxFeesPerGas;
    const maxPriorityFeesPerGas = defaultFeeOptions.gasSettings.maxPriorityFeesPerGas;

    let gasSettings = defaultFeeOptions.gasSettings;
    if (fee?.estimateGas) {
      const feeForEstimation: FeeOptions = { paymentMethod, gasSettings };
      const txRequest = await this.wallet.createTxExecutionRequest(executionPayload, feeForEstimation, options);
      const simulationResult = await this.wallet.simulateTx(
        txRequest,
        true /*simulatePublic*/,
        undefined /* msgSender */,
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
}
