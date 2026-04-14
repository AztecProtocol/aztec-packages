import { jest } from '@jest/globals';

import { type EventMap, type VersionCheck, VersionChecker } from './version_checker.js';

describe('VersionChecker', () => {
  let checker: VersionChecker;
  let getLatestNodeVersion: jest.Mock<() => Promise<string | undefined>>;
  let getLatestRollupVersion: jest.Mock<() => Promise<string | undefined>>;
  let eventHandler: jest.Mock<(...args: EventMap['newVersion']) => void>;

  beforeEach(() => {
    getLatestNodeVersion = jest.fn(() => Promise.resolve('0.1.0'));
    getLatestRollupVersion = jest.fn(() => Promise.resolve('42'));

    const checks: VersionCheck[] = [
      { name: 'node', currentVersion: '0.1.0', getLatestVersion: getLatestNodeVersion },
      { name: 'rollup', currentVersion: '42', getLatestVersion: getLatestRollupVersion },
    ];

    checker = new VersionChecker(checks, 100);

    eventHandler = jest.fn();
    checker.on('newVersion', eventHandler);
  });

  it.each([
    ['it detects no change', () => {}],
    [
      'fetching node version fails',
      () => {
        getLatestNodeVersion.mockRejectedValue(new Error('test error'));
      },
    ],
    [
      'fetching rollup version fails',
      () => {
        getLatestRollupVersion.mockRejectedValue(new Error('test error'));
      },
    ],
    [
      'fetching node version returns undefined',
      () => {
        getLatestNodeVersion.mockResolvedValue(undefined);
      },
    ],
  ])('does not emit an event if %s', async (_, patchFn) => {
    patchFn();
    for (let run = 0; run < 5; run++) {
      await expect(checker.trigger()).resolves.toBeUndefined();
      expect(eventHandler).not.toHaveBeenCalled();
    }
  });

  it('emits newVersion when node version changes', async () => {
    getLatestNodeVersion.mockResolvedValueOnce('0.2.0');
    await checker.trigger();
    expect(eventHandler).toHaveBeenCalledWith({
      name: 'node',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
    });
  });

  it('emits newVersion when rollup version changes', async () => {
    getLatestRollupVersion.mockResolvedValueOnce('999');
    await checker.trigger();
    expect(eventHandler).toHaveBeenCalledWith({
      name: 'rollup',
      currentVersion: '42',
      latestVersion: '999',
    });
  });

  it('emits for each changed version independently', async () => {
    getLatestNodeVersion.mockResolvedValueOnce('0.2.0');
    getLatestRollupVersion.mockResolvedValueOnce('999');
    await checker.trigger();
    expect(eventHandler).toHaveBeenCalledTimes(2);
  });
});
