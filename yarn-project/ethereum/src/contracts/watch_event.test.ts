import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { ViemPublicClient } from '../types.js';
import { makeThrottledErrorLogger, watchContractEvent } from './watch_event.js';

const TEST_ABI = [
  {
    type: 'event',
    name: 'Ping',
    inputs: [{ name: 'value', type: 'uint256', indexed: false }],
  },
] as const;

const ADDRESS = '0x0000000000000000000000000000000000000001';

describe('watchContractEvent', () => {
  let logger: MockProxy<Logger>;
  let client: MockProxy<ViemPublicClient>;
  let latestBlock: bigint;
  let unwatch: (() => void) | undefined;

  const startWatcher = (onLog: (log: { args: { value?: bigint } }) => unknown, maxBlockRange = 100) => {
    unwatch = watchContractEvent(
      client,
      logger,
      { address: ADDRESS, abi: TEST_ABI, eventName: 'Ping', onLog },
      { pollingIntervalMs: 1, maxBlockRange },
    );
    return unwatch;
  };

  const waitForCalls = (fn: { mock: { calls: unknown[] } }, count: number) =>
    retryUntil(() => fn.mock.calls.length >= count, `${count} calls`, 2, 0.005);

  beforeEach(() => {
    logger = mock<Logger>();
    client = mock<ViemPublicClient>();
    latestBlock = 100n;
    client.getBlockNumber.mockImplementation(() => Promise.resolve(latestBlock));
    client.getContractEvents.mockImplementation(() => Promise.resolve([]));
  });

  afterEach(() => {
    unwatch?.();
    unwatch = undefined;
  });

  it('only fetches logs mined after the baseline block', async () => {
    startWatcher(() => {});

    await waitForCalls(client.getBlockNumber, 3);
    expect(client.getContractEvents).not.toHaveBeenCalled();

    latestBlock = 102n;
    await waitForCalls(client.getContractEvents, 1);

    expect(client.getContractEvents).toHaveBeenCalledWith(
      expect.objectContaining({ address: ADDRESS, eventName: 'Ping', fromBlock: 101n, toBlock: 102n }),
    );
  });

  it('chunks wide ranges into maxBlockRange requests and delivers their logs', async () => {
    const received: bigint[] = [];
    client.getContractEvents.mockImplementation(args => {
      const { fromBlock } = args as { fromBlock: bigint };
      return Promise.resolve([{ args: { value: fromBlock } }] as never);
    });

    startWatcher(log => received.push(log.args.value!), 100);
    await waitForCalls(client.getBlockNumber, 1);

    latestBlock = 350n;
    await waitForCalls(client.getContractEvents, 3);

    const ranges = client.getContractEvents.mock.calls.map(([args]) => {
      const { fromBlock, toBlock } = args as { fromBlock: bigint; toBlock: bigint };
      return [fromBlock, toBlock];
    });
    expect(ranges.slice(0, 3)).toEqual([
      [101n, 200n],
      [201n, 300n],
      [301n, 350n],
    ]);
    expect(received.slice(0, 3)).toEqual([101n, 201n, 301n]);
  });

  it('retries a failed chunk from the same cursor without skipping blocks', async () => {
    let failNext = true;
    client.getContractEvents.mockImplementation(() => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('rpc down'));
      }
      return Promise.resolve([]);
    });

    startWatcher(() => {});
    await waitForCalls(client.getBlockNumber, 1);

    latestBlock = 110n;
    await waitForCalls(client.getContractEvents, 2);

    const ranges = client.getContractEvents.mock.calls.map(([args]) => {
      const { fromBlock, toBlock } = args as { fromBlock: bigint; toBlock: bigint };
      return [fromBlock, toBlock];
    });
    expect(ranges[0]).toEqual([101n, 110n]);
    expect(ranges[1]).toEqual([101n, 110n]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('delivers the rest of the batch when a callback throws', async () => {
    client.getContractEvents.mockImplementation(() =>
      Promise.resolve([{ args: { value: 1n } }, { args: { value: 2n } }, { args: { value: 3n } }] as never),
    );

    const handled: bigint[] = [];
    startWatcher(log => {
      if (log.args.value === 2n) {
        throw new Error('callback blew up');
      }
      handled.push(log.args.value!);
    });
    await waitForCalls(client.getBlockNumber, 1);

    latestBlock = 101n;
    await retryUntil(() => handled.length >= 2, 'logs handled', 2, 0.005);

    expect(handled).toEqual([1n, 3n]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs rejections from async callbacks instead of leaving them unhandled', async () => {
    client.getContractEvents.mockImplementation(() =>
      Promise.resolve([{ args: { value: 1n } }, { args: { value: 2n } }] as never),
    );

    startWatcher(log =>
      log.args.value === 1n ? Promise.reject(new Error('async callback blew up')) : Promise.resolve(),
    );
    await waitForCalls(client.getBlockNumber, 1);

    latestBlock = 101n;
    await retryUntil(() => logger.error.mock.calls.length >= 1, 'error logged', 2, 0.005);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Ping'),
      expect.objectContaining({ message: 'async callback blew up' }),
    );
  });

  it('stops polling once unwatched', async () => {
    startWatcher(() => {});
    await waitForCalls(client.getBlockNumber, 2);

    unwatch!();
    unwatch = undefined;
    await new Promise(resolve => setTimeout(resolve, 20));

    const callsAfterStop = client.getBlockNumber.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(client.getBlockNumber.mock.calls.length).toEqual(callsAfterStop);
  });
});

describe('makeThrottledErrorLogger', () => {
  it('warns on the first error and throttles the ones that follow', () => {
    jest.useFakeTimers();
    try {
      const logger = mock<Logger>();
      const logError = makeThrottledErrorLogger(logger, 'watcher failed');

      logError(new Error('first'));
      logError(new Error('second'));
      jest.advanceTimersByTime(59_000);
      logError(new Error('third'));
      jest.advanceTimersByTime(2_000);
      logError(new Error('fourth'));

      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.verbose).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
