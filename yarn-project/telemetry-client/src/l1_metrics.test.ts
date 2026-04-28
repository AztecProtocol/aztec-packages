import { EthAddress } from '@aztec/foundation/eth-address';

import { type MockProxy, mock } from 'jest-mock-extended';
import type { PublicClient } from 'viem';

import { L1Metrics } from './l1_metrics.js';
import { L1_BALANCE_ETH, L1_BLOB_BASE_FEE_WEI, L1_BLOCK_HEIGHT, L1_GAS_PRICE_WEI } from './metrics.js';
import type { BatchObservableResult, Meter, ObservableGauge } from './telemetry.js';

describe('L1Metrics', () => {
  let meter: MockProxy<Meter>;
  let client: MockProxy<PublicClient>;
  let gauges: Map<string, ObservableGauge>;

  beforeEach(() => {
    gauges = new Map();
    meter = mock<Meter>();
    client = mock<PublicClient>();

    meter.createObservableGauge.mockImplementation(metric => {
      const gauge = { __name: metric.name } as unknown as ObservableGauge;
      gauges.set(metric.name, gauge);
      return gauge;
    });
  });

  it('registers all gauges with the batch observable callback on start', () => {
    const metrics = new L1Metrics(meter, client as any, [EthAddress.random()]);
    metrics.start();

    expect(meter.addBatchObservableCallback).toHaveBeenCalledTimes(1);
    const [, observables] = meter.addBatchObservableCallback.mock.calls[0];
    expect(observables).toEqual(
      expect.arrayContaining([
        gauges.get(L1_BALANCE_ETH.name),
        gauges.get(L1_BLOCK_HEIGHT.name),
        gauges.get(L1_GAS_PRICE_WEI.name),
        gauges.get(L1_BLOB_BASE_FEE_WEI.name),
      ]),
    );
    expect(observables).toHaveLength(4);
  });

  it('removes all gauges from the batch observable callback on stop', () => {
    const metrics = new L1Metrics(meter, client as any, [EthAddress.random()]);
    metrics.start();
    metrics.stop();

    expect(meter.removeBatchObservableCallback).toHaveBeenCalledTimes(1);
    const [, observables] = meter.removeBatchObservableCallback.mock.calls[0];
    expect(observables).toHaveLength(4);
  });

  it('observes gas price and blob base fee even when no addresses are configured', async () => {
    const metrics = new L1Metrics(meter, client as any, []);
    metrics.start();

    const [callback, observables] = meter.addBatchObservableCallback.mock.calls[0];
    const observer: MockProxy<BatchObservableResult> = mock<BatchObservableResult>();
    client.getBlockNumber.mockResolvedValue(123n);
    client.getGasPrice.mockResolvedValue(456n);
    client.getBlobBaseFee.mockResolvedValue(789n);

    await callback(observer);

    expect(observer.observe).toHaveBeenCalledWith(gauges.get(L1_BLOCK_HEIGHT.name), 123);
    expect(observer.observe).toHaveBeenCalledWith(gauges.get(L1_GAS_PRICE_WEI.name), 456);
    expect(observer.observe).toHaveBeenCalledWith(gauges.get(L1_BLOB_BASE_FEE_WEI.name), 789);
    // Both gauges are registered with the batch callback so observations are recorded.
    expect(observables).toContain(gauges.get(L1_GAS_PRICE_WEI.name));
    expect(observables).toContain(gauges.get(L1_BLOB_BASE_FEE_WEI.name));
  });
});
