import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';

import { INITIAL_L2_BLOCK_NUM, LogId, TxHash } from '../index.js';

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
   * @remarks If this is set, `txHash` can't be defined.
   */
  fromBlock?: number;
  /** The block number until which to fetch logs (not inclusive). */
  toBlock?: number;
  /**
   * Log id after which to start fetching logs .
   * @remarks This is a continuation parameter and when it is set, txHash and fromBlock and toBlock are ignored.
   */
  afterLog?: LogId;
  /** The contract address to filter logs by. */
  contractAddress?: AztecAddress;
  /**
   * Selector of the event/log topic.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/2632
   */
  selector?: FunctionSelector;
};

/**
 * Validates a log filter.
 * @param filter - Log filter to validate.
 * @throws If the filter is invalid.
 */
export function validateLogFilter(filter: LogFilter) {
  if (filter.afterLog) {
    // afterLog is a continuation parameter and when it is set, txHash and fromBlock and toBlock are ignored.
    return;
  }
  if (filter.txHash && (filter.fromBlock || filter.toBlock)) {
    throw new Error('Invalid filter: "txHash" is set along with "fromBlock" and or "toBlock".');
  }
  if (filter.fromBlock !== undefined && filter.fromBlock < INITIAL_L2_BLOCK_NUM) {
    throw new Error(`"fromBlock" (${filter.fromBlock}) smaller than genesis block number (${INITIAL_L2_BLOCK_NUM}).`);
  }
}
