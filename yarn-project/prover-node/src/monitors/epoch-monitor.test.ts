import { type L2BlockSource } from '@aztec/circuit-types';
import { sleep } from '@aztec/foundation/sleep';

import { type MockProxy, mock } from 'jest-mock-extended';

import { EpochMonitor, type EpochMonitorHandler } from './epoch-monitor.js';

describe('EpochMonitor', () => {
  let l2BlockSource: MockProxy<L2BlockSource>;
  let handler: MockProxy<EpochMonitorHandler>;
  let epochMonitor: EpochMonitor;

  let lastEpochComplete: bigint = 0n;

  beforeEach(() => {
    handler = mock<EpochMonitorHandler>();
    l2BlockSource = mock<L2BlockSource>({
      isEpochComplete(epochNumber) {
        return Promise.resolve(epochNumber <= lastEpochComplete);
      },
    });

    epochMonitor = new EpochMonitor(l2BlockSource, { pollingIntervalMs: 10 });
  });

  afterEach(async () => {
    await epochMonitor.stop();
  });

  it('triggers initial epoch sync', async () => {
    l2BlockSource.getL2EpochNumber.mockResolvedValue(10n);
    epochMonitor.start(handler);
    await sleep(100);

    expect(handler.handleInitialEpochSync).toHaveBeenCalledWith(9n);
  });

  it('does not trigger initial epoch sync on epoch zero', async () => {
    l2BlockSource.getL2EpochNumber.mockResolvedValue(0n);
    epochMonitor.start(handler);
    await sleep(100);

    expect(handler.handleInitialEpochSync).not.toHaveBeenCalled();
  });

  it('triggers epoch completion', async () => {
    lastEpochComplete = 9n;
    l2BlockSource.getL2EpochNumber.mockResolvedValue(10n);
    epochMonitor.start(handler);

    await sleep(100);
    expect(handler.handleEpochCompleted).not.toHaveBeenCalled();

    lastEpochComplete = 10n;
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(10n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);

    lastEpochComplete = 11n;
    await sleep(100);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(11n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(2);
  });

  it('triggers epoch completion if initial epoch was already complete', async () => {
    // this happens if we start the monitor on the very last slot of an epoch
    lastEpochComplete = 10n;
    l2BlockSource.getL2EpochNumber.mockResolvedValue(10n);
    epochMonitor.start(handler);

    await sleep(100);
    expect(handler.handleInitialEpochSync).toHaveBeenCalledWith(9n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledWith(10n);
    expect(handler.handleEpochCompleted).toHaveBeenCalledTimes(1);
  });
});
