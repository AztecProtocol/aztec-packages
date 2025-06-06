import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
import { type FunctionCall, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import type { RequestMethodOptions, SendMethodOptions, SimulateMethodOptions } from './interaction_options.js';

/** A batch of function calls to be sent as a single transaction through a wallet. */
export class BatchCall extends BaseContractInteraction {
  constructor(
    wallet: Wallet,
    protected calls: BaseContractInteraction[],
  ) {
    super(wallet);
  }

  /**
   * Create a transaction execution request that represents this batch, encoded and authenticated by the
   * user's wallet, ready to be simulated.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns A Promise that resolves to a transaction instance.
   */
  public async create(options: SendMethodOptions = {}): Promise<TxExecutionRequest> {
    const requestWithoutFee = await this.request(options);

    const { fee: userFee, txNonce, cancellable } = options;
    const fee = await this.getFeeOptions(requestWithoutFee, userFee, { txNonce, cancellable });

    return await this.wallet.createTxExecutionRequest(requestWithoutFee, fee, { txNonce, cancellable });
  }

  /**
   * Returns an execution request that represents this operation.
   * @param options - An optional object containing additional configuration for the request generation.
   * @returns An execution payload wrapped in promise.
   */
  public async request(options: RequestMethodOptions = {}): Promise<ExecutionPayload> {
    const requests = await this.getRequests();
    const combinedPayload = mergeExecutionPayloads(requests);
    return new ExecutionPayload(
      combinedPayload.calls,
      combinedPayload.authWitnesses.concat(options.authWitnesses ?? []),
      combinedPayload.capsules.concat(options.capsules ?? []),
      combinedPayload.extraHashedArgs,
    );
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
  public async simulate(options: SimulateMethodOptions = {}): Promise<any> {
    const { indexedExecutionPayloads, utility } = (await this.getRequests()).reduce<{
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
    const requestWithoutFee = new ExecutionPayload(
      combinedPayload.calls,
      combinedPayload.authWitnesses.concat(options.authWitnesses ?? []),
      combinedPayload.capsules.concat(options.capsules ?? []),
      combinedPayload.extraHashedArgs,
    );
    const { fee: userFee, txNonce, cancellable } = options;
    const fee = await this.getFeeOptions(requestWithoutFee, userFee, {});
    const txRequest = await this.wallet.createTxExecutionRequest(requestWithoutFee, fee, {
      txNonce,
      cancellable,
    });

    const utilityCalls = utility.map(
      async ([call, index]) =>
        [
          await this.wallet.simulateUtility(call.name, call.args, call.to, options?.authWitnesses, options?.from),
          index,
        ] as const,
    );

    const [utilityResults, simulatedTx] = await Promise.all([
      Promise.all(utilityCalls),
      this.wallet.simulateTx(txRequest, true, options?.from, options?.skipTxValidation),
    ]);

    const results: any[] = [];

    utilityResults.forEach(([{ result }, index]) => {
      results[index] = result;
    });
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
    return results;
  }

  private async getRequests() {
    return await Promise.all(this.calls.map(c => c.request()));
  }
}
