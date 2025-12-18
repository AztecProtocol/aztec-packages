import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { NodeStats } from '@aztec/stdlib/tx';

/**
 * Error thrown when a contract is not found in the database.
 */
export class ContractNotFoundError extends Error {
  constructor(contractAddress: string) {
    super(`DB has no contract with address ${contractAddress}`);
  }
}

/**
 * Error thrown when a contract class is not found in the database.
 */
export class ContractClassNotFoundError extends Error {
  constructor(contractClassId: string) {
    super(`DB has no contract class with id ${contractClassId}`);
  }
}

/*
 * Collected stats during the execution of a transaction.
 */
export type ExecutionStats = {
  /**
   * Contains an entry for each RPC call performed during the execution
   */
  nodeRPCCalls: NodeStats;
};

/**
 * The interface for the data layer required to perform private and utility execution.
 */
export interface ExecutionDataProvider {
  /**
   * Looks for nullifiers of active contract notes and marks them as nullified in the db if a nullifier is found.
   */
  syncNoteNullifiers(contractAddress: AztecAddress): Promise<void>;
}
