import { type FunctionCall, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import { ExecutionPayload, TxSimulationResult, UtilityExecutionResult, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import type { BatchedMethod, Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import { getGasLimits } from './get_gas_limits.js';
import {
  NO_FROM,
  type RequestInteractionOptions,
  type SimulateInteractionOptions,
  type SimulationResult,
  extractOffchainOutput,
  toSimulateOptions,
} from './interaction_options.js';

/** A batch of function calls to be sent as a single transaction through a wallet. */
// docs:start:batch_call_class
export class BatchCall extends BaseContractInteraction {
  constructor(
    wallet: Wallet,
    protected interactions: (BaseContractInteraction | ExecutionPayload)[],
  ) {
    super(wallet);
  }
  // docs:end:batch_call_class

  /**
   * Returns an execution request that represents this operation.
   * @param options - An optional object containing additional configuration for the request generation.
   * @returns An execution payload wrapped in promise.
   */
  public async request(options: RequestInteractionOptions = {}): Promise<ExecutionPayload> {
    const requests = await this.getExecutionPayloads();
    const feeExecutionPayload = options.fee?.paymentMethod
      ? await options.fee.paymentMethod.getExecutionPayload()
      : undefined;
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, ...requests])
      : mergeExecutionPayloads([...requests]);
    return finalExecutionPayload;
  }

  /**
   * Simulates/executes the batch, supporting private, public and utility functions. Although this is a single
   * interaction with the wallet, private and public functions will be grouped into a single ExecutionPayload
   * that the wallet will simulate as a single transaction. Utility function calls will be executed
   * one by one.
   * @param options - An optional object containing additional configuration for the interaction.
   * @returns The results of all the interactions that make up the batch
   */
  public async simulate(options: SimulateInteractionOptions): Promise<SimulationResult> {
    const { indexedExecutionPayloads, utility } = (await this.getExecutionPayloads()).reduce<{
      /** Keep track of the number of private calls to retrieve the return values */
      privateIndex: 0;
      /** Keep track of the number of public calls to retrieve the return values */
      publicIndex: 0;
      /** The public and private function execution requests in the batch */
      indexedExecutionPayloads: [ExecutionPayload, number, number][];
      /** The utility function calls in the batch. */
      utility: [FunctionCall, number][];
    }>(
      (acc, current, index) => {
        const call = current.calls[0];
        if (call.type === FunctionType.UTILITY) {
          acc.utility.push([call, index]);
        } else {
          acc.indexedExecutionPayloads.push([
            current,
            index,
            call.type === FunctionType.PRIVATE ? acc.privateIndex++ : acc.publicIndex++,
          ]);
        }
        return acc;
      },
      { indexedExecutionPayloads: [], utility: [], publicIndex: 0, privateIndex: 0 },
    );

    const batchRequests: BatchedMethod[] = [];

    // Add utility calls to batch
    for (const [call] of utility) {
      batchRequests.push({
        name: 'executeUtility' as const,
        args: [call, { scopes: options.from === NO_FROM ? [] : [options.from], authWitnesses: options.authWitnesses }],
      });
    }

    // Add tx simulation to batch if there are any private/public calls
    if (indexedExecutionPayloads.length > 0) {
      const payloads = indexedExecutionPayloads.map(([request]) => request);
      const combinedPayload = mergeExecutionPayloads(payloads);
      const executionPayload = new ExecutionPayload(
        combinedPayload.calls,
        combinedPayload.authWitnesses.concat(options.authWitnesses ?? []),
        combinedPayload.capsules.concat(options.capsules ?? []),
        combinedPayload.extraHashedArgs,
      );

      batchRequests.push({
        name: 'simulateTx' as const,
        args: [executionPayload, toSimulateOptions(options)],
      });
    }

    const batchResults = batchRequests.length > 0 ? await this.wallet.batch(batchRequests) : [];

    const results: any[] = [];

    // Process utility results (they come first in batch results)
    for (let i = 0; i < utility.length; i++) {
      const [call, resultIndex] = utility[i];
      const wrappedResult = batchResults[i];
      if (wrappedResult.name === 'executeUtility') {
        const utilityResult = wrappedResult.result as UtilityExecutionResult;
        const rawReturnValues = utilityResult.result;
        const offchainOutput = extractOffchainOutput(utilityResult.offchainEffects, utilityResult.anchorBlockTimestamp);
        results[resultIndex] = {
          result: rawReturnValues ? decodeFromAbi(call.returnTypes, rawReturnValues) : [],
          ...offchainOutput,
        };
      }
    }

    // Process tx simulation result (it comes last if present)
    let simulatedTx: TxSimulationResult | undefined;
    if (indexedExecutionPayloads.length > 0) {
      const txResultWrapper = batchResults[utility.length];
      if (txResultWrapper.name === 'simulateTx') {
        simulatedTx = txResultWrapper.result as TxSimulationResult;
        indexedExecutionPayloads.forEach(([request, callIndex, resultIndex]) => {
          const call = request.calls[0];
          // As account entrypoints are private, for private functions we retrieve the return values from the first nested call
          // since we're interested in the first set of values AFTER the account entrypoint
          // For public functions we retrieve the first values directly from the public output.
          const rawReturnValues =
            call.type == FunctionType.PRIVATE
              ? simulatedTx!.getPrivateReturnValues()?.nested?.[resultIndex].values
              : simulatedTx!.getPublicReturnValues()?.[resultIndex].values;

          results[callIndex] = {
            result: rawReturnValues ? decodeFromAbi(call.returnTypes, rawReturnValues) : [],
            ...extractOffchainOutput(
              simulatedTx!.offchainEffects,
              simulatedTx!.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
            ),
          };
        });
      }
    }

    if ((options.includeMetadata || options.fee?.estimateGas) && simulatedTx) {
      const { gasLimits, teardownGasLimits } = getGasLimits(simulatedTx, options.fee?.estimatedGasPadding);
      this.log.verbose(
        `Estimated gas limits for batch tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
      );
      return {
        result: results,
        estimatedGas: { gasLimits, teardownGasLimits },
        offchainEffects: [],
        offchainMessages: [],
      };
    }

    return { result: results, offchainEffects: [], offchainMessages: [] };
  }

  protected async getExecutionPayloads(): Promise<ExecutionPayload[]> {
    return await Promise.all(this.interactions.map(i => (i instanceof ExecutionPayload ? i : i.request())));
  }
}
