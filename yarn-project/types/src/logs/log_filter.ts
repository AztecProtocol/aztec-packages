import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';

/**
 * Log filter used to fetch L2 logs.
 */
export type LogFilter = {
  /** The block number from which to start fetching logs (inclusive). */
  fromBlock?: number;
  /** The block number until which to fetch logs (not inclusive). */
  toBlock?: number;
  /** Maximum number of logs to fetch. */
  limit?: number;
  /** The contract address to filter logs by. */
  contractAddress?: AztecAddress;
  /** The event selector to filter logs by. */
  selector?: FunctionSelector;
};
