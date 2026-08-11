import type { Logger } from '@aztec/foundation/log';

/** Minimum time between warnings while a watcher keeps failing; failures in between are logged at verbose. */
const WATCH_ERROR_WARN_INTERVAL_MS = 60_000;

/** Handlers passed to viem's `watchContractEvent` for a single L1 event watcher. */
export type WatchEventHandlers<TLog> = {
  /** Invoked with every batch of logs the watcher polls. */
  onLogs: (logs: TLog[]) => void;
  /** Invoked whenever a polling tick fails. */
  onError: (err: Error) => void;
};

/**
 * Builds the handlers for a viem `watchContractEvent` subscription on the given event.
 *
 * `onLogs` calls `handleLog` per log inside a try/catch, so a throwing callback does not drop the rest of the
 * batch (viem advances its block cursor before invoking the handler, so a thrown error loses those logs for good).
 * `onError` warns on the first failure and then at most once per minute while failures continue, logging at verbose
 * in between, so an unreachable RPC endpoint does not produce one warning per polling interval.
 */
export function makeWatchEventHandlers<TLog>(
  logger: Logger,
  eventName: string,
  handleLog: (log: TLog) => void,
): WatchEventHandlers<TLog> {
  let lastWarnedAt: number | undefined;

  return {
    onLogs: logs => {
      for (const log of logs) {
        try {
          handleLog(log);
        } catch (err) {
          logger.error(`Error handling ${eventName} L1 event`, err);
        }
      }
    },
    onError: err => {
      const now = Date.now();
      const message = `Error watching for ${eventName} L1 events`;
      if (lastWarnedAt === undefined || now - lastWarnedAt >= WATCH_ERROR_WARN_INTERVAL_MS) {
        lastWarnedAt = now;
        logger.warn(message, { err });
      } else {
        logger.verbose(message, { err });
      }
    },
  };
}
