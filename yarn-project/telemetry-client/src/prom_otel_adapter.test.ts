import { type Logger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { OtelGauge } from './prom_otel_adapter.js';
import { type Meter, type ObservableGauge } from './telemetry.js';

describe('OtelGauge', () => {
  let mockLogger: Logger;
  let mockMeter: Meter;
  let mockObservableGauge: ObservableGauge;
  let otelGauge: OtelGauge<Record<string, never>>;

  beforeEach(() => {
    // Mocking Logger, Meter, and ObservableGauge
    mockLogger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    mockMeter = { createObservableGauge: jest.fn(() => mockObservableGauge) } as unknown as Meter;
    mockObservableGauge = { addCallback: jest.fn() } as unknown as ObservableGauge;

    otelGauge = new OtelGauge(mockLogger, mockMeter, 'test_gauge', 'Test gauge');
  });

  test('increments value without labels', () => {
    otelGauge.inc();
    expect(otelGauge['currentValue']).toBe(1);

    otelGauge.inc(5);
    expect(otelGauge['currentValue']).toBe(6);
  });

  test('sets value without labels', () => {
    otelGauge.set(10);
    expect(otelGauge['currentValue']).toBe(10);
  });

  test('decrements value without labels', () => {
    otelGauge.set(5);
    otelGauge.dec();
    expect(otelGauge['currentValue']).toBe(4);

    otelGauge.dec();
    expect(otelGauge['currentValue']).toBe(3);
  });

  test('resets value without labels', () => {
    otelGauge.set(5);
    otelGauge.reset();
    expect(otelGauge['currentValue']).toBe(0);
  });

  test('increments and sets value with labels', () => {
    const labelConfig = { region: 'us-east-1', instance: 'test-instance' };
    const otelGaugeWithLabels = new OtelGauge(
      mockLogger,
      mockMeter,
      'test_gauge_with_labels',
      'Test gauge with labels',
      ['region', 'instance'],
    );

    otelGaugeWithLabels.inc(labelConfig, 3);
    expect(otelGaugeWithLabels['labeledValues'].get(JSON.stringify(labelConfig))).toBe(3);

    otelGaugeWithLabels.set(labelConfig, 10);
    expect(otelGaugeWithLabels['labeledValues'].get(JSON.stringify(labelConfig))).toBe(10);
  });

  test('decrements value with labels', () => {
    const labelConfig = { region: 'us-east-1', instance: 'test-instance' };
    const otelGaugeWithLabels = new OtelGauge(
      mockLogger,
      mockMeter,
      'test_gauge_with_labels',
      'Test gauge with labels',
      ['region', 'instance'],
    );

    otelGaugeWithLabels.set(labelConfig, 5);
    otelGaugeWithLabels.dec(labelConfig);
    expect(otelGaugeWithLabels['labeledValues'].get(JSON.stringify(labelConfig))).toBe(4);
  });

  test('handles invalid labels with error', () => {
    const invalidLabelConfig = { invalid: 'label' };
    const otelGaugeWithLabels = new OtelGauge(
      mockLogger,
      mockMeter,
      'test_gauge_with_labels',
      'Test gauge with labels',
      ['region', 'instance'],
    );

    expect(() => otelGaugeWithLabels.inc(invalidLabelConfig as any, 1)).toThrowError('Invalid label key: invalid');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('executes addCollect functions', () => {
    const collectFn = jest.fn();
    otelGauge.addCollect(collectFn);
    otelGauge['handleObservation']({ observe: jest.fn() });

    expect(collectFn).toHaveBeenCalledWith(otelGauge);
  });

  test('parses and observes labeled values safely', () => {
    otelGauge = new OtelGauge(mockLogger, mockMeter, 'test_gauge', 'Test gauge', ['type']);

    const labelConfig = { type: 'ping' };
    const labelStr = JSON.stringify(labelConfig);
    otelGauge['labeledValues'].set(labelStr, 5);

    const mockResult = { observe: jest.fn() };
    otelGauge['handleObservation'](mockResult);

    expect(mockResult.observe).toHaveBeenCalledWith(5, labelConfig);
  });
});
