import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { LogFn } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import {
  LogCursor,
  type PublicLogsQuery,
  type Tag,
  logResultToHumanReadable,
  queryAllPublicLogsByTags,
} from '@aztec/stdlib/logs';

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
 * Fetches public logs for a (contract, tag) pair, draining all pages via the stdlib pagination helper.
 * In `--follow` mode, polls indefinitely: each round drains all currently-available logs, then sleeps
 * until the next poll if nothing new was found.
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

  const drainLogs = async () => {
    const query: PublicLogsQuery = {
      contractAddress,
      tags: [afterLog !== undefined ? { tag, afterLog } : tag],
      fromBlock,
      toBlock,
      txHash,
    };
    const [logsForTag] = await queryAllPublicLogsByTags(node, query);
    if (logsForTag.length > 0) {
      afterLog = LogCursor.fromLog(logsForTag[logsForTag.length - 1]);
    }
    return logsForTag;
  };

  if (follow) {
    log('Fetching logs...');
    while (true) {
      const results = await drainLogs();
      if (results.length === 0) {
        await sleep(1000);
      } else {
        results.forEach(r => log(logResultToHumanReadable(r)));
      }
    }
  } else {
    const results = await drainLogs();
    if (results.length === 0) {
      log(
        `No logs found for {contractAddress: ${contractAddress.toString()}, tag: ${tag.toString()}` +
          `${txHash ? `, txHash: ${txHash.toString()}` : ''}` +
          `${fromBlock !== undefined ? `, fromBlock: ${fromBlock}` : ''}` +
          `${toBlock !== undefined ? `, toBlock: ${toBlock}` : ''}` +
          `${afterLog ? `, afterLog: ${afterLog.toString()}` : ''}}`,
      );
    } else {
      log('Logs found: \n');
      results.forEach(r => log(logResultToHumanReadable(r)));
    }
  }
}
