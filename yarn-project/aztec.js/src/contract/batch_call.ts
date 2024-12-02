import { type FunctionCall, type TxExecutionRequest } from '@aztec/circuit-types';
import { FunctionType, decodeFromAbi } from '@aztec/foundation/abi';

import { type Wallet } from '../account/index.js';
import { BaseContractInteraction, type SendMethodOptions } from './base_contract_interaction.js';
import type { SimulateMethodOptions } from './contract_function_interaction.js';

/** A batch of function calls to be sent as a single transaction through a wallet. */
export class BatchCall extends BaseContractInteraction {
  constructor(wallet: Wallet, protected calls: FunctionCall[]) {
    super(wallet);
  }

  /**
   * Create a transaction execution request that represents this batch, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param opts - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public async create(opts?: SendMethodOptions): Promise<TxExecutionRequest> {
    const calls = this.calls;
    const fee = await this.getFeeOptions({ calls, ...opts });
    return await this.wallet.createTxExecutionRequest({ calls, ...opts, fee });
  }

  /**
   * Simulate a transaction and get its return values
   * Differs from prove in a few important ways:
   * 1. It returns the values of the function execution
   * 2. It supports `unconstrained`, `private` and `public` functions
   *
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns The result of the transaction as returned by the contract function.
   */
  public async simulate(options: SimulateMethodOptions = {}): Promise<any> {
    const { indexedCalls, unconstrained } = this.calls.reduce<{
      /** Keep track of the number of private calls to retrieve the return values */
      privateIndex: 0;
      /** Keep track of the number of public calls to retrieve the return values */
      publicIndex: 0;
      /** The public and private function calls in the batch */
      indexedCalls: [FunctionCall, number, number][];
      /** The unconstrained function calls in the batch. */
      unconstrained: [FunctionCall, number][];
    }>(
      (acc, current, index) => {
        if (current.type === FunctionType.UNCONSTRAINED) {
          acc.unconstrained.push([current, index]);
        } else {
          acc.indexedCalls.push([
            current,
            index,
            current.type === FunctionType.PRIVATE ? acc.privateIndex++ : acc.publicIndex++,
          ]);
        }
        return acc;
      },
      { indexedCalls: [], unconstrained: [], publicIndex: 0, privateIndex: 0 },
    );

    const calls = indexedCalls.map(([call]) => call);
    const fee = await this.getFeeOptions({ calls, ...options });
    const txRequest = await this.wallet.createTxExecutionRequest({ calls, ...options, fee });

    const unconstrainedCalls = unconstrained.map(
      async ([call, index]) =>
        [await this.wallet.simulateUnconstrained(call.name, call.args, call.to, options?.from), index] as const,
    );

    const [unconstrainedResults, simulatedTx] = await Promise.all([
      Promise.all(unconstrainedCalls),
      this.wallet.simulateTx(txRequest, true, options?.from, options?.skipTxValidation),
    ]);

    const results: any[] = [];

    unconstrainedResults.forEach(([result, index]) => {
      results[index] = result;
    });
    indexedCalls.forEach(([call, callIndex, resultIndex]) => {
      // As account entrypoints are private, for private functions we retrieve the return values from the first nested call
      // since we're interested in the first set of values AFTER the account entrypoint
      // For public functions we retrieve the first values directly from the public output.
      const rawReturnValues =
        call.type == FunctionType.PRIVATE
          ? simulatedTx.getPrivateReturnValues()?.nested?.[resultIndex].values
          : simulatedTx.getPublicReturnValues()?.[resultIndex].values;

      results[callIndex] = rawReturnValues ? decodeFromAbi(call.returnTypes, rawReturnValues) : [];
    });
    return results;
  }
}
