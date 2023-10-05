import { AztecAddress, FunctionSelector } from '@aztec/circuits.js';

import { TxHash } from '../index.js';

/**
 * Log filter used to fetch L2 logs.
 */
export type LogFilter = {
  /**
   * Hash of a transaction from which to fetch the logs.
   * @remarks If this is set, `fromBlock` and `toBlock` can't be defined.
   */
  txHash?: TxHash;
  /** The block number from which to start fetching logs (inclusive). */
  fromBlock?: number;
  /** The block number until which to fetch logs (not inclusive). */
  toBlock?: number;
  /** The contract address to filter logs by. */
  contractAddress?: AztecAddress;
  /**
   * Selector of the event/log topic.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/2704
   */
  selector?: FunctionSelector;
};
