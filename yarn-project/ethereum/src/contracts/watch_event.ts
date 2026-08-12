import type { Logger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';

import type { Abi, ContractEventName, GetContractEventsReturnType, Hex } from 'viem';

import type { ViemClient } from '../types.js';

/** Minimum time between warnings while a watcher keeps failing; failures in between are logged at verbose. */
const WATCH_ERROR_WARN_INTERVAL_MS = 60_000;

/** Default maximum number of blocks queried per `eth_getLogs` request. */
const DEFAULT_MAX_BLOCK_RANGE = 100;

/** Options for {@link watchContractEvent}. */
export type WatchContractEventOptions = {
  /** How often to poll for new L1 blocks, in ms. Defaults to the client's polling interval. */
  pollingIntervalMs?: number;
  /** Maximum number of blocks per `eth_getLogs` request; wider catch-up ranges are split into chunks. */
  maxBlockRange?: number;
};

/** Event identity and handler for {@link watchContractEvent}. */
export type WatchContractEventParameters<
  TAbi extends Abi,
  TEventName extends ContractEventName<TAbi>,
  TStrict extends boolean | undefined = undefined,
> = {
  address: Hex;
  abi: TAbi;
  eventName: TEventName;
  /** Whether logs must decode against the event's indexed/non-indexed arguments (defaults to false). */
  strict?: TStrict;
  /** Called once per event log. Errors, thrown or from a returned promise, are caught and logged. */
  onLog: (log: GetContractEventsReturnType<TAbi, TEventName, TStrict>[number]) => unknown;
};

/**
 * Returns an error logger that emits at most one warning per minute for the given message, logging at verbose in
 * between, so a persistent failure (e.g. an unreachable RPC endpoint) does not warn once per polling interval.
 */
export function makeThrottledErrorLogger(logger: Logger, message: string): (err: unknown) => void {
  let lastWarnedAt: number | undefined;
  return err => {
    const now = Date.now();
    if (lastWarnedAt === undefined || now - lastWarnedAt >= WATCH_ERROR_WARN_INTERVAL_MS) {
      lastWarnedAt = now;
      logger.warn(message, { err });
    } else {
      logger.verbose(message, { err });
    }
  };
}

/**
 * Watches for contract events by polling `eth_blockNumber` (cached by viem per client) and fetching new logs with
 * ranged `eth_getLogs` requests, never installing server-side filters. Server-side filters are unusable against
 * real-world endpoints: a load balancer routes polls to backends that never saw the filter, and providers report a
 * purged filter with error codes viem does not recognize as "filter gone", so viem's own watchers either churn
 * recreating filters or poll a dead filter id forever while silently missing events.
 *
 * Only events mined after the first poll are reported, so events mined within roughly one polling interval of
 * subscribing may be missed. Requests never span more than `maxBlockRange` blocks: catching up after downtime is
 * chunked into multiple requests, and the cursor advances per successful chunk so a failure retries from where it
 * left off on the next tick. A reorg may re-emit events and removals are never reported.
 *
 * @returns A function that stops the watcher.
 */
export function watchContractEvent<
  TAbi extends Abi,
  TEventName extends ContractEventName<TAbi>,
  TStrict extends boolean | undefined = undefined,
>(
  client: ViemClient,
  logger: Logger,
  params: WatchContractEventParameters<TAbi, TEventName, TStrict>,
  options: WatchContractEventOptions = {},
): () => void {
  const { address, abi, eventName, strict, onLog } = params;
  const pollingIntervalMs = options.pollingIntervalMs ?? client.pollingInterval;
  const maxBlockRange = BigInt(options.maxBlockRange ?? DEFAULT_MAX_BLOCK_RANGE);

  const logHandlerError = (err: unknown) => logger.error(`Error handling ${eventName} L1 event`, err);
  const deliver = (log: GetContractEventsReturnType<TAbi, TEventName, TStrict>[number]) => {
    try {
      const result = onLog(log);
      if (result instanceof Promise) {
        result.catch(logHandlerError);
      }
    } catch (err) {
      logHandlerError(err);
    }
  };

  let stopped = false;
  let nextBlock: bigint | undefined;

  const poll = async () => {
    const latestBlock = await client.getBlockNumber();
    if (nextBlock === undefined) {
      nextBlock = latestBlock + 1n;
      return;
    }
    let fromBlock: bigint = nextBlock;
    while (fromBlock <= latestBlock && !stopped) {
      const chunkEnd = fromBlock + maxBlockRange - 1n;
      const toBlock = chunkEnd < latestBlock ? chunkEnd : latestBlock;
      const logs = await client.getContractEvents<TAbi, TEventName, TStrict, bigint, bigint>({
        address,
        abi,
        eventName,
        strict,
        fromBlock,
        toBlock,
      });
      for (const log of logs) {
        deliver(log);
      }
      fromBlock = toBlock + 1n;
      nextBlock = fromBlock;
    }
  };

  const handlePollError = makeThrottledErrorLogger(logger, `Error polling for ${eventName} L1 events`);
  const runner = new RunningPromise(poll, logger, pollingIntervalMs, handlePollError).start();

  return () => {
    stopped = true;
    void runner.stop();
  };
}
