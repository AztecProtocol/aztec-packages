import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { LogFn } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
import { LogCursor, type PublicLogsQuery, type Tag } from '@aztec/stdlib/logs';

/** Options for the `get-logs` CLI command. */
export type GetLogsOptions = {
  /** Contract address that emitted the logs (required). */
  contractAddress: AztecAddress;
  /** Tag to filter logs by (required). */
  tag: Tag;
  /** Restrict the search to this tx hash. Mutually exclusive with `fromBlock`/`toBlock`. */
  txHash?: TxHash;
  /** Lower block bound, inclusive. */
  fromBlock?: BlockNumber;
  /** Upper block bound, exclusive. */
  toBlock?: BlockNumber;
  /** Log cursor to resume pagination strictly after a previously-seen log. */
  afterLog?: LogCursor;
  /** Node RPC URL. */
  nodeUrl: string;
  /** When set, polls indefinitely for new logs. Incompatible with `txHash` and `toBlock`. */
  follow: boolean;
  /** Log function. */
  log: LogFn;
};

/**
 * Fetches public logs for a (contract, tag) pair, paginating per-tag via `afterLog` cursors until a page returns
 * fewer than {@link MAX_LOGS_PER_TAG} entries. In `--follow` mode, sleeps and retries after each drained page.
 */
export async function getLogs(options: GetLogsOptions): Promise<void> {
  const { txHash, fromBlock, toBlock, contractAddress, tag, nodeUrl, follow, log } = options;
  let afterLog = options.afterLog;

  if (follow) {
    if (txHash) {
      throw Error('Cannot use --follow with --tx-hash');
    }
    if (toBlock) {
      throw Error('Cannot use --follow with --to-block');
    }
  }
  if (txHash !== undefined && (fromBlock !== undefined || toBlock !== undefined)) {
    throw Error('Cannot combine --tx-hash with --from-block / --to-block');
  }

  const node = createAztecNodeClient(nodeUrl);

  const fetchLogs = async () => {
    const query: PublicLogsQuery = {
      contractAddress,
      tags: [afterLog !== undefined ? { tag, afterLog } : tag],
      fromBlock,
      toBlock,
      txHash,
    };
    const [logsForTag] = await node.getPublicLogsByTags(query);

    if (logsForTag.length === 0) {
      if (!follow) {
        log(
          `No logs found for {contractAddress: ${contractAddress.toString()}, tag: ${tag.toString()}` +
            `${txHash ? `, txHash: ${txHash.toString()}` : ''}` +
            `${fromBlock !== undefined ? `, fromBlock: ${fromBlock}` : ''}` +
            `${toBlock !== undefined ? `, toBlock: ${toBlock}` : ''}` +
            `${afterLog ? `, afterLog: ${afterLog.toString()}` : ''}}`,
        );
      }
    } else {
      if (!follow && afterLog === undefined) {
        log('Logs found: \n');
      }
      logsForTag.forEach(r => log(r.toHumanReadable()));
      afterLog = LogCursor.fromLog(logsForTag[logsForTag.length - 1]);
    }
    return logsForTag.length === MAX_LOGS_PER_TAG;
  };

  if (follow) {
    log('Fetching logs...');
    while (true) {
      const hasMore = await fetchLogs();
      if (!hasMore) {
        await sleep(1000);
      }
    }
  } else {
    while (await fetchLogs()) {
      // Keep fetching logs until we reach the end (a page below the limit).
    }
  }
}
