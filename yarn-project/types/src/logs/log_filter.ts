import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';

import { LogId, TxHash } from '../index.js';

/**
 * Log filter used to fetch L2 logs.
 */
export type LogFilter = {
  /**
   * Hash of a transaction from which to fetch the logs.
   * @remarks If this is set, `fromBlock` and `toBlock` can't be defined.
   */
  txHash?: TxHash;
  /**
   * The block number from which to start fetching logs (inclusive).
   * @remarks If this is set, `txHash` and `fromLog` can't be defined.
   */
  fromBlock?: number;
  /** The block number until which to fetch logs (not inclusive). */
  toBlock?: number;
  /**
   * Log id from which to start fetching logs (inclusive).
   * @remarks If this is set, `fromBlock` and `txHash` can't be defined.
   */
  fromLog?: LogId;
  /** The contract address to filter logs by. */
  contractAddress?: AztecAddress;
  /**
   * Selector of the event/log topic.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/2704
   */
  selector?: FunctionSelector;
};

/**
 * Validates a log filter.
 * @param filter - Log filter to validate.
 * @throws If the filter is invalid.
 */
export function validateLogFilter(filter: LogFilter) {
  if (filter.txHash && (filter.fromBlock || filter.toBlock || filter.fromLog)) {
    throw new Error("If txHash is set, fromBlock, toBlock, and fromLog can't be defined.");
  }

  if (filter.fromBlock !== undefined && filter.fromLog) {
    throw new Error("If fromBlock is set, fromLog can't be defined.");
  }
}
