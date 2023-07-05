import { AztecAddress, TxContext } from '@aztec/circuits.js';
import { FunctionAbi } from '@aztec/foundation/abi';
import { ExecutionRequest, TxExecutionRequest } from '@aztec/types';

export * from './account_contract.js';
export * from './account_collection.js';

/** Represents an implementation for a user account contract. Knows how to encode and sign a tx for that particular implementation. */
export interface AccountImplementation {
  getAddress(): AztecAddress;
  /** Creates a tx to be sent from a given account contract given a set of execution requests. */
  createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
    abi: FunctionAbi,
  ): Promise<TxExecutionRequest>;
}
