import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { Capsule, TxProvingResult } from '@aztec/stdlib/tx';

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
  protected async proveInternal(options: SendMethodOptions): Promise<TxProvingResult> {
    const executionPayload = await this.request(options);
    return await this.wallet.proveTx(executionPayload, options);
  }

  // docs:start:prove
  /**
   * Proves a transaction execution request and returns a tx object ready to be sent.
   * @param options - optional arguments to be used in the creation of the transaction
   * @returns The resulting transaction
   */
  public async prove(options: SendMethodOptions): Promise<ProvenTx> {
    // docs:end:prove
    const txProvingResult = await this.proveInternal(options);
    return new ProvenTx(
      this.wallet,
      await txProvingResult.toTx(),
      txProvingResult.getOffchainEffects(),
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
  public send(options: SendMethodOptions): SentTx {
    // docs:end:send
    const sendTx = async () => {
      const txProvingResult = await this.proveInternal(options);
      return this.wallet.sendTx(await txProvingResult.toTx());
    };
    return new SentTx(this.wallet, sendTx);
  }

  // docs:start:estimateGas
  /**
   * Estimates gas for a given tx request and returns gas limits for it.
   * @param options - Options.
   * @returns Gas limits.
   */
  public async estimateGas(
    options: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> {
    // docs:end:estimateGas
    const executionPayload = await this.request(options);
    const simulationResult = await this.wallet.simulateTx(executionPayload, {
      ...options,
      fee: { ...options?.fee, estimateGas: false },
    });
    const { totalGas: gasLimits, teardownGas: teardownGasLimits } = getGasLimits(
      simulationResult,
      options?.fee?.estimatedGasPadding,
    );
    return { gasLimits, teardownGasLimits };
  }
}
