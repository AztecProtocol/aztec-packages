import { FunctionType } from '@aztec/circuits.js/abi';
import { HashedValues, TxContext, TxExecutionRequest } from '@aztec/circuits.js/tx';

import { type EntrypointInterface, type ExecutionRequestInit } from './entrypoint.js';

/**
 * Default implementation of the entrypoint interface. It calls a function on a contract directly
 */
export class DefaultEntrypoint implements EntrypointInterface {
  constructor(private chainId: number, private protocolVersion: number) {}

  async createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest> {
    const { fee, calls, authWitnesses = [], hashedArguments = [], capsules = [] } = exec;

    if (calls.length > 1) {
      throw new Error(`Expected a single call, got ${calls.length}`);
    }

    const call = calls[0];

    if (call.type !== FunctionType.PRIVATE) {
      throw new Error('Public entrypoints are not allowed');
    }

    const entrypointHashedValues = await HashedValues.fromValues(call.args);
    const txContext = new TxContext(this.chainId, this.protocolVersion, fee.gasSettings);
    return Promise.resolve(
      new TxExecutionRequest(
        call.to,
        call.selector,
        entrypointHashedValues.hash,
        txContext,
        [...hashedArguments, entrypointHashedValues],
        authWitnesses,
        capsules,
      ),
    );
  }
}
