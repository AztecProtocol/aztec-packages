import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { LogResult } from '../logs/log_result.js';
import type { PrivateLogsQuery, PublicLogsQuery } from '../logs/logs_query.js';

/**
 * Interface of classes allowing for the retrieval of logs.
 */
export interface L2LogsSource {
  /**
   * Gets private logs matching the given tags. Returns one inner array per element of `query.tags`, in
   * input order. An empty inner array means no logs matched that tag.
   */
  getPrivateLogsByTags(query: PrivateLogsQuery): Promise<LogResult[][]>;

  /**
   * Gets public logs matching the given tags for the given contract. Returns one inner array per element
   * of `query.tags`, in input order. An empty inner array means no logs matched that tag.
   */
  getPublicLogsByTags(query: PublicLogsQuery): Promise<LogResult[][]>;

  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<BlockNumber>;
}
