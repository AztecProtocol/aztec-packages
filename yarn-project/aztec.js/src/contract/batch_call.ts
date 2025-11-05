import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
import { type FunctionCall, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import {
  type RequestInteractionOptions,
  type SimulateInteractionOptions,
  toSimulateOptions,
} from './interaction_options.js';

/** A batch of function calls to be sent as a single transaction through a wallet. */
export class BatchCall extends BaseContractInteraction {
  constructor(
    wallet: Wallet,
    protected interactions: (BaseContractInteraction | ExecutionPayload)[],
  ) {
    super(wallet);
  }

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
   * Simulate a transaction and get its return values
   * Differs from prove in a few important ways:
   * 1. It returns the values of the function execution
   * 2. It supports `utility`, `private` and `public` functions
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public async simulate(options: SimulateInteractionOptions): Promise<any> {
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

    const payloads = indexedExecutionPayloads.map(([request]) => request);
    const combinedPayload = mergeExecutionPayloads(payloads);
    const executionPayload = new ExecutionPayload(
      combinedPayload.calls,
      combinedPayload.authWitnesses.concat(options.authWitnesses ?? []),
      combinedPayload.capsules.concat(options.capsules ?? []),
      combinedPayload.extraHashedArgs,
    );

    const utilityBatchPromise =
      utility.length > 0
        ? this.wallet.batch(
            utility.map(([call]) => ({
              name: 'simulateUtility' as const,
              args: [call.name, call.args, call.to, options?.authWitnesses] as const,
            })),
          )
        : Promise.resolve([]);

    const [utilityBatchResults, simulatedTx] = await Promise.all([
      utilityBatchPromise,
      indexedExecutionPayloads.length > 0
        ? this.wallet.simulateTx(executionPayload, await toSimulateOptions(options))
        : Promise.resolve(),
    ]);

    const results: any[] = [];

    utilityBatchResults.forEach((wrappedResult, utilityIndex) => {
      const [, originalIndex] = utility[utilityIndex];
      results[originalIndex] = wrappedResult.result.result;
    });

    if (simulatedTx) {
      indexedExecutionPayloads.forEach(([request, callIndex, resultIndex]) => {
        const call = request.calls[0];
        // As account entrypoints are private, for private functions we retrieve the return values from the first nested call
        // since we're interested in the first set of values AFTER the account entrypoint
        // For public functions we retrieve the first values directly from the public output.
        const rawReturnValues =
          call.type == FunctionType.PRIVATE
            ? simulatedTx.getPrivateReturnValues()?.nested?.[resultIndex].values
            : simulatedTx.getPublicReturnValues()?.[resultIndex].values;

        results[callIndex] = rawReturnValues ? decodeFromAbi(call.returnTypes, rawReturnValues) : [];
      });
    }

    return results;
  }

  protected async getExecutionPayloads(): Promise<ExecutionPayload[]> {
    return await Promise.all(this.interactions.map(i => (i instanceof ExecutionPayload ? i : i.request())));
  }
}
