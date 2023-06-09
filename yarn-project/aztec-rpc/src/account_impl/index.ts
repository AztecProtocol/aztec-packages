import { TxContext } from '@aztec/circuits.js';
import { ExecutionRequest, SignedTxExecutionRequest } from '@aztec/types';

export interface AccountImplementation {
  createAuthenticatedTxRequest(executions: ExecutionRequest[], txContext: TxContext): Promise<SignedTxExecutionRequest>;
}
