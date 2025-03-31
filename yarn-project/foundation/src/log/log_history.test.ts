import { jest } from '@jest/globals';

import { enableLogs } from './debug.js';
import { type Logger, createLogger } from './index.js';
import { LogHistory } from './log_history.js';

jest.useFakeTimers({ doNotFake: ['performance'] });

// We skip log history tests since this class is not used and it pollutes the logs in CI.
describe.skip('log history', () => {
  let logger: Logger;
  let logHistory: LogHistory;
  const timestamp = new Date().toISOString();
  const name = 'test:a';

  beforeEach(() => {
    logger = createLogger(name);
    enableLogs(name);
    logHistory = new LogHistory();
  });

  it('keeps debug logs', () => {
    logHistory.enable();
    expect(logHistory.getLogs()).toEqual([]);
    logger.debug('0');
    logger.debug('1');
    logger.debug('2');
    expect(logHistory.getLogs()).toEqual([
      [timestamp, name, '0'],
      [timestamp, name, '1'],
      [timestamp, name, '2'],
    ]);
  });

  it('does not keep logs if not enabled', () => {
    logger.debug('0');
    logger.debug('1');
    expect(logHistory.getLogs()).toEqual([]);
  });

  it('returns last n logs', () => {
    logHistory.enable();
    expect(logHistory.getLogs()).toEqual([]);
    logger.debug('0');
    logger.debug('1');
    logger.debug('2');
    logger.debug('3');
    logger.debug('4');
    expect(logHistory.getLogs(2)).toEqual([
      [timestamp, name, '3'],
      [timestamp, name, '4'],
    ]);
  });

  it('only keeps logs with enabled namespace', () => {
    logHistory.enable();
    const name2 = 'test:b';
    const logger2 = createLogger(name2);
    logger.debug('0');
    logger2.debug('zero');
    expect(logHistory.getLogs()).toEqual([[timestamp, name, '0']]);

    enableLogs(`${name},${name2}`);
    logger.debug('1');
    logger2.debug('one');
    expect(logHistory.getLogs()).toEqual([
      [timestamp, name, '0'],
      [timestamp, name, '1'],
      [timestamp, name2, 'one'],
    ]);
  });

  it('clears all logs', () => {
    logHistory.enable();
    logger.debug('0');
    logger.debug('1');
    logger.debug('2');
    logHistory.clear();
    expect(logHistory.getLogs()).toEqual([]);
  });

  it('clears first n logs', () => {
    logHistory.enable();
    logger.debug('0');
    logger.debug('1');
    logger.debug('2');
    logHistory.clear(2);
    expect(logHistory.getLogs()).toEqual([[timestamp, name, '2']]);
  });
});
