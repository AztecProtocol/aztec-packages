import { VersionChecker } from '@aztec/stdlib/update-checker';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ExitCode, softShutdown } from './util.js';

describe('softShutdown', () => {
  let exitSpy: jest.SpiedFunction<typeof process.exit>;
  let originalSigterm: NodeJS.SignalsListener[];
  let originalSigint: NodeJS.SignalsListener[];

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    originalSigterm = process.listeners('SIGTERM');
    originalSigint = process.listeners('SIGINT');
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    originalSigterm.forEach(l => process.on('SIGTERM', l));
    originalSigint.forEach(l => process.on('SIGINT', l));
  });

  it('awaits every signal handler without exiting the process', async () => {
    const order: string[] = [];
    const handlers = [
      () => {
        order.push('a');
        return Promise.resolve();
      },
      () => {
        order.push('b');
        return Promise.resolve();
      },
    ];

    await softShutdown(() => {}, handlers);

    expect(order).toEqual(['a', 'b']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('awaits remaining handlers even when one rejects', async () => {
    const second = jest.fn(() => Promise.resolve());
    const handlers = [() => Promise.reject(new Error('boom')), second];

    await expect(softShutdown(() => {}, handlers)).resolves.toBeUndefined();
    expect(second).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('re-arms SIGTERM so a later signal exits cleanly with ROLLUP_UPGRADE', async () => {
    await softShutdown(() => {}, []);

    process.emit('SIGTERM');

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.ROLLUP_UPGRADE);
  });

  it('re-arms SIGINT so a later signal exits cleanly with ROLLUP_UPGRADE', async () => {
    await softShutdown(() => {}, []);

    process.emit('SIGINT');

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.ROLLUP_UPGRADE);
  });
});

describe('auto-shutdown version check wiring', () => {
  it('does not fire while the canonical rollup stays compatible', async () => {
    const checker = new VersionChecker(
      [{ name: 'rollup', currentVersion: 'compatible', getLatestVersion: () => Promise.resolve('compatible') }],
      60_000,
    );
    const onNewVersion = jest.fn();
    checker.on('newVersion', onNewVersion);

    await checker.trigger();

    expect(onNewVersion).not.toHaveBeenCalled();
  });

  it('fires once the canonical rollup becomes incompatible', async () => {
    const latest = 'incompatible: VK tree root (expected 0x1, got 0x2)';
    const checker = new VersionChecker(
      [{ name: 'rollup', currentVersion: 'compatible', getLatestVersion: () => Promise.resolve(latest) }],
      60_000,
    );
    const onNewVersion = jest.fn();
    checker.on('newVersion', onNewVersion);

    await checker.trigger();

    expect(onNewVersion).toHaveBeenCalledWith({ name: 'rollup', currentVersion: 'compatible', latestVersion: latest });
  });
});
