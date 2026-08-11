import type { Logger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { makeWatchEventHandlers } from './watch_event.js';

describe('makeWatchEventHandlers', () => {
  let logger: MockProxy<Logger>;

  beforeEach(() => {
    logger = mock<Logger>();
  });

  it('delivers the rest of the batch when a callback throws', () => {
    const handled: number[] = [];
    const { onLogs } = makeWatchEventHandlers<number>(logger, 'Slashed', log => {
      if (log === 2) {
        throw new Error('callback blew up');
      }
      handled.push(log);
    });

    onLogs([1, 2, 3]);

    expect(handled).toEqual([1, 3]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs rejections from async callbacks instead of leaving them unhandled', async () => {
    const { onLogs } = makeWatchEventHandlers<number>(logger, 'SlasherUpdated', log =>
      log === 1 ? Promise.reject(new Error('async callback blew up')) : Promise.resolve(),
    );

    onLogs([1, 2]);
    await new Promise(setImmediate);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('SlasherUpdated'),
      expect.objectContaining({ message: 'async callback blew up' }),
    );
  });

  it('warns on the first error and throttles the ones that follow', () => {
    jest.useFakeTimers();
    try {
      const { onError } = makeWatchEventHandlers<number>(logger, 'Slashed', () => {});

      onError(new Error('first'));
      onError(new Error('second'));
      jest.advanceTimersByTime(59_000);
      onError(new Error('third'));
      jest.advanceTimersByTime(2_000);
      onError(new Error('fourth'));

      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.verbose).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
