import { type ExecutionRequestInit } from '@aztec/entrypoints/interfaces';
import { mergeExecutionRequestInits } from '@aztec/entrypoints/utils';
import { type FunctionCall, FunctionType, decodeFromAbi } from '@aztec/stdlib/abi';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction, type SendMethodOptions } from './base_contract_interaction.js';
import type { SimulateMethodOptions } from './contract_function_interaction.js';

/** A batch of function calls to be sent as a single transaction through a wallet. */
export class BatchCall extends BaseContractInteraction {
  constructor(wallet: Wallet, protected calls: BaseContractInteraction[]) {
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

    const { fee: userFee } = options;
    const fee = await this.getFeeOptions({ ...requestWithoutFee, fee: userFee });

    return await this.wallet.createTxExecutionRequest({ ...requestWithoutFee, fee });
  }

  /**
   * Returns an execution request that represents this operation.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public async request(options: SendMethodOptions = {}): Promise<Omit<ExecutionRequestInit, 'fee'>> {
    const requests = await this.getRequests();
    const { nonce, cancellable } = options;
    return mergeExecutionRequestInits(requests, { nonce, cancellable });
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
    const { indexedRequests, unconstrained } = (await this.getRequests()).reduce<{
      /** Keep track of the number of private calls to retrieve the return values */
      privateIndex: 0;
      /** Keep track of the number of public calls to retrieve the return values */
      publicIndex: 0;
      /** The public and private function execution requests in the batch */
      indexedRequests: [Omit<ExecutionRequestInit, 'fee'>, number, number][];
      /** The unconstrained function calls in the batch. */
      unconstrained: [FunctionCall, number][];
    }>(
      (acc, current, index) => {
        const call = current.calls[0];
        if (call.type === FunctionType.UNCONSTRAINED) {
          acc.unconstrained.push([call, index]);
        } else {
          acc.indexedRequests.push([
            current,
            index,
            call.type === FunctionType.PRIVATE ? acc.privateIndex++ : acc.publicIndex++,
          ]);
        }
        return acc;
      },
      { indexedRequests: [], unconstrained: [], publicIndex: 0, privateIndex: 0 },
    );

    const requests = indexedRequests.map(([request]) => request);
    const requestWithoutFee = mergeExecutionRequestInits(requests);
    const { fee: userFee } = options;
    const fee = await this.getFeeOptions({ ...requestWithoutFee, fee: userFee });
    const txRequest = await this.wallet.createTxExecutionRequest({ ...requestWithoutFee, fee });

    const unconstrainedCalls = unconstrained.map(
      async ([call, index]) =>
        [
          await this.wallet.simulateUnconstrained(call.name, call.args, call.to, options?.authwits, options?.from),
          index,
        ] as const,
    );

    const [unconstrainedResults, simulatedTx] = await Promise.all([
      Promise.all(unconstrainedCalls),
      this.wallet.simulateTx(txRequest, true, options?.from, options?.skipTxValidation),
    ]);

    const results: any[] = [];

    unconstrainedResults.forEach(([result, index]) => {
      results[index] = result;
    });
    indexedRequests.forEach(([request, callIndex, resultIndex]) => {
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

  /**
   * Return all authWitnesses added for this interaction.
   */
  public override getAuthWitnesses() {
    return [this.authWitnesses, ...this.calls.map(c => c.getAuthWitnesses())].flat();
  }

  /**
   * Return all hashedArguments added for this interaction.
   */
  public override getHashedArguments() {
    return [this.hashedArguments, ...this.calls.map(c => c.getHashedArguments())].flat();
  }

  /**
   * Return all capsules added for this interaction.
   */
  public override getCapsules() {
    return [this.capsules, ...this.calls.map(c => c.getCapsules())].flat();
  }

  private async getRequests() {
    return await Promise.all(this.calls.map(c => c.request()));
  }
}
