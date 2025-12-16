import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';

import type { LogFilter } from '../logs/log_filter.js';
import type { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from './get_logs_response.js';

/**
 * Interface of classes allowing for the retrieval of logs.
 */
export interface L2LogsSource {
  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @param logsPerTag - The maximum number of logs to return for each tag. Default returns everything
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]>;

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse>;

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse>;

  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;
}
