import { FunctionType } from '@aztec/stdlib/abi';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { EntrypointInterface, FeeOptions, UserExecutionRequest } from './interfaces.js';

/**
 * Default implementation of the entrypoint interface. It calls a function on a contract directly
 */
export class DefaultEntrypoint implements EntrypointInterface {
  constructor(private chainId: number, private protocolVersion: number) {}

  async createTxExecutionRequest(exec: UserExecutionRequest, fee: FeeOptions): Promise<TxExecutionRequest> {
    const { calls, authWitnesses = [], capsules = [] } = exec;

    if (calls.length > 1) {
      throw new Error(`Expected a single call, got ${calls.length}`);
    }

    const call = calls[0];

    const hashedArguments = [await HashedValues.fromValues(call.args)];

    if (call.type !== FunctionType.PRIVATE) {
      throw new Error('Public entrypoints are not allowed');
    }

    const entrypointHashedValues = await HashedValues.fromValues(call.args);
    const txContext = new TxContext(this.chainId, this.protocolVersion, fee.gasSettings);
    return new TxExecutionRequest(
      call.to,
      call.selector,
      entrypointHashedValues.hash,
      txContext,
      [...hashedArguments, entrypointHashedValues],
      authWitnesses,
      capsules,
    );
  }
}
