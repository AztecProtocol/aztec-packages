import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createDebugOnlyLogger, enableLogs } from './debug.js';
import { LogHistory } from './log_history.js';

describe('log history', () => {
  let debug: (msg: string) => void;
  let logHistory: LogHistory;
  const timestamp = new Date('2020-01-01T00:00:00.000Z').toISOString();
  const name = 'test:a';

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.setSystemTime();
  });

  beforeEach(() => {
    debug = createDebugOnlyLogger(name);
    enableLogs(name);
    logHistory = new LogHistory();
  });

  it('keeps debug logs', () => {
    logHistory.enable();
    expect(logHistory.getLogs()).toEqual([]);
    debug('0');
    debug('1');
    debug('2');
    expect(logHistory.getLogs()).toEqual([
      [timestamp, name, '0'],
      [timestamp, name, '1'],
      [timestamp, name, '2'],
    ]);
  });

  it('does not keep logs if not enabled', () => {
    debug('0');
    debug('1');
    expect(logHistory.getLogs()).toEqual([]);
  });

  it('returns last n logs', () => {
    logHistory.enable();
    expect(logHistory.getLogs()).toEqual([]);
    debug('0');
    debug('1');
    debug('2');
    debug('3');
    debug('4');
    expect(logHistory.getLogs(2)).toEqual([
      [timestamp, name, '3'],
      [timestamp, name, '4'],
    ]);
  });

  it('only keeps logs with enabled namespace', () => {
    logHistory.enable();
    const name2 = 'test:b';
    const debug2 = createDebugOnlyLogger(name2);
    debug('0');
    debug2('zero');
    expect(logHistory.getLogs()).toEqual([[timestamp, name, '0']]);

    enableLogs(`${name},${name2}`);
    debug('1');
    debug2('one');
    expect(logHistory.getLogs()).toEqual([
      [timestamp, name, '0'],
      [timestamp, name, '1'],
      [timestamp, name2, 'one'],
    ]);
  });

  it('clears all logs', () => {
    logHistory.enable();
    debug('0');
    debug('1');
    debug('2');
    logHistory.clear();
    expect(logHistory.getLogs()).toEqual([]);
  });

  it('clears first n logs', () => {
    logHistory.enable();
    debug('0');
    debug('1');
    debug('2');
    logHistory.clear(2);
    expect(logHistory.getLogs()).toEqual([[timestamp, name, '2']]);
  });
});
