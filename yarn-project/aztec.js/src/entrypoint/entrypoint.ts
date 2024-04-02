import { type FunctionCall, type TxExecutionRequest } from '@aztec/circuit-types';

import { EntrypointPayload, type FeeOptions } from './payload.js';

export { EntrypointPayload, FeeOptions };

/** Creates transaction execution requests out of a set of function calls. */
export interface EntrypointInterface {
  /**
   * Generates an execution request out of set of function calls.
   * @param executions - The execution intents to be run.
   * @param feeOpts - The fee to be paid for the transaction.
   * @returns The authenticated transaction execution request.
   */
  createTxExecutionRequest(executions: FunctionCall[], feeOpts?: FeeOptions): Promise<TxExecutionRequest>;
}
