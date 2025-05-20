import { FunctionType } from '@aztec/stdlib/abi';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { EntrypointInterface, FeeOptions, TxExecutionOptions } from './interfaces.js';
import type { ExecutionPayload } from './payload.js';

/**
 * Default implementation of the entrypoint interface. It calls a function on a contract directly
 */
export class DefaultEntrypoint implements EntrypointInterface {
  constructor(
    private chainId: number,
    private rollupVersion: number,
  ) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    if (options.nonce || options.cancellable !== undefined) {
      throw new Error('TxExecutionOptions are not supported in DefaultEntrypoint');
    }
    // Initial request with calls, authWitnesses and capsules
    const { calls, authWitnesses, capsules, extraHashedArgs } = exec;

    if (calls.length > 1) {
      throw new Error(`Expected a single call, got ${calls.length}`);
    }

    const call = calls[0];

    // Hash the arguments for the function call
    const hashedArguments = [await HashedValues.fromArgs(call.args)];

    if (call.type !== FunctionType.PRIVATE) {
      throw new Error('Public entrypoints are not allowed');
    }

    // Assemble the tx request
    return new TxExecutionRequest(
      call.to,
      call.selector,
      hashedArguments[0].hash,
      new TxContext(this.chainId, this.rollupVersion, fee.gasSettings),
      [...hashedArguments, ...extraHashedArgs],
      authWitnesses,
      capsules,
    );
  }
}
