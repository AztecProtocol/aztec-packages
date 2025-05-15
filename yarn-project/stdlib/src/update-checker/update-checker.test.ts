import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';

import { type EventMap, UpdateChecker } from './update-checker.js';

describe('UpdateChecker', () => {
  let checker: UpdateChecker;
  let fetch: jest.Mock<typeof globalThis.fetch>;
  let getRollupAddress: jest.Mock<(version: number | 'canonical') => Promise<EthAddress>>;
  let rollupAddressAtStart: EthAddress;
  let nodeVersionAtStart: string;
  let eventHandlers: {
    [K in keyof EventMap]: jest.Mock<(...args: EventMap[K]) => void>;
  };

  beforeEach(() => {
    nodeVersionAtStart = '0.1.0';
    rollupAddressAtStart = EthAddress.random();
    fetch = jest.fn(() => Promise.resolve(new Response(JSON.stringify({ version: nodeVersionAtStart }))));
    getRollupAddress = jest.fn(() => Promise.resolve(rollupAddressAtStart));

    checker = new UpdateChecker(
      new URL('http://localhost'),
      nodeVersionAtStart,
      'canonical',
      rollupAddressAtStart,
      fetch,
      getRollupAddress,
      100,
    );

    eventHandlers = {
      updateConfig: jest.fn(),
      newVersion: jest.fn(),
      newRollup: jest.fn(),
    };

    for (const [event, fn] of Object.entries(eventHandlers)) {
      checker.on(event as keyof EventMap, fn);
    }
  });

  it.each([
    ['it detects no change', () => {}],
    [
      'fetching config fails',
      () => {
        fetch.mockRejectedValue(new Error('test error'));
      },
    ],
    [
      'fetching rollup address fails',
      () => {
        getRollupAddress.mockRejectedValue(new Error('test error'));
      },
    ],
    [
      'the config does not match the schema',
      () => {
        fetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              foo: 'bar',
            }),
          ),
        );
      },
    ],
    [
      'the config does not match the schema',
      () => {
        fetch.mockResolvedValue(
          new Response(
            JSON.stringify({
              version: 1,
            }),
          ),
        );
      },
    ],
  ])('does not emit an event if %s', async (_, patchFn) => {
    patchFn();
    for (let run = 0; run < 5; run++) {
      await expect(checker.trigger()).resolves.toBeUndefined();
      for (const fn of Object.values(eventHandlers)) {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  });

  it.each<[keyof EventMap, () => void]>([
    [
      'newRollup',
      () => {
        getRollupAddress.mockResolvedValueOnce(EthAddress.random());
      },
    ],
    [
      'newVersion',
      () => {
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ version: '0.1.0-foo' })));
      },
    ],
    [
      'updateConfig',
      () => {
        fetch.mockResolvedValueOnce(new Response(JSON.stringify({ config: { maxTxsPerBlock: 16 } })));
      },
    ],
  ])('emits event: %s', async (event, patchFn) => {
    patchFn();
    await expect(checker.trigger()).resolves.toBeUndefined();
    expect(eventHandlers[event]).toHaveBeenCalled();
  });

  it('calls updateConfig only when config changes', async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          version: nodeVersionAtStart,
          config: {
            foo: 'bar',
          },
        }),
      ),
    );

    await checker.trigger();
    expect(eventHandlers.updateConfig).toHaveBeenCalledTimes(1);

    await checker.trigger();
    expect(eventHandlers.updateConfig).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          version: nodeVersionAtStart,
          config: {
            bar: 'baz',
          },
        }),
      ),
    );

    await checker.trigger();
    expect(eventHandlers.updateConfig).toHaveBeenCalledTimes(2);
  });

  it('reaches out to the expected config URL', async () => {
    await checker.trigger();
    expect(fetch).toHaveBeenCalledWith(new URL(`http://localhost/aztec-${rollupAddressAtStart}/index.json`));
  });
});
