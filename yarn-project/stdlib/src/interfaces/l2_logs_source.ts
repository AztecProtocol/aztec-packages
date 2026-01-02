import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { AztecAddress } from '../aztec-address/index.js';
import type { LogFilter } from '../logs/log_filter.js';
import type { SiloedTag } from '../logs/siloed_tag.js';
import type { Tag } from '../logs/tag.js';
import type { TxScopedL2Log } from '../logs/tx_scoped_l2_log.js';
import type { GetContractClassLogsResponse, GetPublicLogsResponse } from './get_logs_response.js';

/**
 * Interface of classes allowing for the retrieval of logs.
 */
export interface L2LogsSource {
  /**
   * Gets all private logs that match any of the `tags`. For each tag, an array of matching logs is returned. An empty
   * array implies no logs match that tag.
   */
  getPrivateLogsByTags(tags: SiloedTag[]): Promise<TxScopedL2Log[][]>;

  /**
   * Gets all public logs that match any of the `tags` from the specified contract. For each tag, an array of matching
   * logs is returned. An empty array implies no logs match that tag.
   */
  getPublicLogsByTagsFromContract(contractAddress: AztecAddress, tags: Tag[]): Promise<TxScopedL2Log[][]>;

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
