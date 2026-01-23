import { FunctionType } from '@aztec/stdlib/abi';
import type { GasSettings } from '@aztec/stdlib/gas';
import { ExecutionPayload, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import type { ChainInfo, EntrypointInterface } from './interfaces.js';

/**
 * Default implementation of the entrypoint interface. It calls a function on a contract directly
 */
export class DefaultEntrypoint implements EntrypointInterface {
  async createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    chainInfo: ChainInfo,
  ): Promise<TxExecutionRequest> {
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
      new TxContext(chainInfo.chainId.toNumber(), chainInfo.version.toNumber(), gasSettings),
      [...hashedArguments, ...extraHashedArgs],
      authWitnesses,
      capsules,
    );
  }

  async wrapExecutionPayload(exec: ExecutionPayload, _options?: any): Promise<ExecutionPayload> {
    if (exec.calls.length !== 1) {
      throw new Error(`DefaultEntrypoint can only wrap a single call, got ${exec.calls.length}`);
    }

    const call = exec.calls[0];

    const hashedArguments = await HashedValues.fromArgs(call.args);

    return new ExecutionPayload(
      [call],
      exec.authWitnesses,
      exec.capsules,
      [hashedArguments, ...exec.extraHashedArgs],
      exec.feePayer,
    );
  }
}
