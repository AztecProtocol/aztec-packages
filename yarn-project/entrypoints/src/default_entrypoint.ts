import { FunctionType } from '@aztec/stdlib/abi';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { EntrypointInterface, FeeOptions, TxExecutionOptions } from './interfaces.js';
import type { ExecutionPayload } from './payload.js';

/**
 * Default implementation of the entrypoint interface. It calls a function on a contract directly
 */
export class DefaultEntrypoint implements EntrypointInterface {
  constructor(private chainId: number, private protocolVersion: number) {}

  async createTxExecutionRequest(
    exec: ExecutionPayload,
    fee: FeeOptions,
    _options: TxExecutionOptions,
  ): Promise<TxExecutionRequest> {
    const { calls, authWitnesses = [], capsules = [] } = exec;

    if (calls.length > 1) {
      throw new Error(`Expected a single call, got ${calls.length}`);
    }

    const call = calls[0];

    const hashedArguments = [await HashedValues.fromValues(call.args)];

    if (call.type !== FunctionType.PRIVATE) {
      throw new Error('Public entrypoints are not allowed');
    }

    const txContext = new TxContext(this.chainId, this.protocolVersion, fee.gasSettings);
    return new TxExecutionRequest(
      call.to,
      call.selector,
      hashedArguments[0].hash,
      txContext,
      [...hashedArguments],
      authWitnesses,
      capsules,
    );
  }
}
