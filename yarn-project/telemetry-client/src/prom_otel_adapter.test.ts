import type { Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';

import { OtelAvgMinMax, OtelGauge, OtelHistogram } from './prom_otel_adapter.js';
import type { Histogram, Meter, ObservableGauge } from './telemetry.js';

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

    expect(() => otelGaugeWithLabels.inc(invalidLabelConfig as any, 1)).toThrow('Invalid label key: invalid');
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

describe('OtelHistogram', () => {
  let mockLogger: Logger;
  let mockMeter: Meter;
  let mockHistogram: Histogram;
  let otelHistogram: OtelHistogram<Record<string, never>>;

  beforeEach(() => {
    mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), silent: jest.fn() } as unknown as Logger;
    mockHistogram = { record: jest.fn() } as unknown as Histogram;
    mockMeter = { createHistogram: jest.fn(() => mockHistogram) } as unknown as Meter;

    otelHistogram = new OtelHistogram(mockLogger, mockMeter, 'test_histogram', 'Test histogram');

    jest.spyOn(Timer.prototype, 's').mockImplementation(function (this: Timer) {
      return 100;
    });
  });

  test('observes value without labels', () => {
    otelHistogram.observe(5);
    expect(mockHistogram.record).toHaveBeenCalledWith(5);
  });

  test('observes value with labels', () => {
    const labelConfig = { topic: 'tx' };
    const otelHistogramWithLabels = new OtelHistogram(
      mockLogger,
      mockMeter,
      'test_histogram_with_labels',
      'Test histogram with labels',
      [],
      ['topic'],
    );

    otelHistogramWithLabels.observe(labelConfig, 10);
    expect(mockHistogram.record).toHaveBeenCalledWith(10, labelConfig);
  });

  test('throws error for invalid labels', () => {
    const invalidLabelConfig = { invalid: 'tx' };
    const otelHistogramWithLabels = new OtelHistogram(
      mockLogger,
      mockMeter,
      'test_histogram_with_labels',
      'Test histogram with labels',
      [],
      ['topic'],
    );

    expect(() => otelHistogramWithLabels.observe(invalidLabelConfig as any, 5)).toThrow('Invalid label key: invalid');
  });

  test('starts timer and records duration without labels', () => {
    const timer = otelHistogram.startTimer();
    timer();

    expect(mockHistogram.record).toHaveBeenCalledWith(100);
  });

  test('starts timer and records duration with labels', () => {
    const labelConfig1 = { topic: 'tx' };
    const labelConfig2 = { topic: 'block_proposal' };
    const otelHistogramWithLabels = new OtelHistogram(
      mockLogger,
      mockMeter,
      'test_histogram_with_labels',
      'Test histogram with labels',
      [],
      ['topic'],
    );

    const timer1 = otelHistogramWithLabels.startTimer(labelConfig1);
    timer1();

    const timer2 = otelHistogramWithLabels.startTimer(labelConfig2);
    timer2();

    expect(mockHistogram.record).toHaveBeenCalledWith(100, labelConfig1);
    expect(mockHistogram.record).toHaveBeenCalledWith(100, labelConfig2);
  });
});

describe('OtelAvgMinMax', () => {
  let mockLogger: Logger;
  let mockMeter: Meter;
  let mockAvgGauge: ObservableGauge;
  let mockMinGauge: ObservableGauge;
  let mockMaxGauge: ObservableGauge;
  let otelAvgMinMax: OtelAvgMinMax<Record<string, never>>;

  beforeEach(() => {
    mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    mockAvgGauge = { addCallback: jest.fn() } as unknown as ObservableGauge;
    mockMinGauge = { addCallback: jest.fn() } as unknown as ObservableGauge;
    mockMaxGauge = { addCallback: jest.fn() } as unknown as ObservableGauge;
    mockMeter = {
      createObservableGauge: jest
        .fn()
        .mockReturnValueOnce(mockAvgGauge)
        .mockReturnValueOnce(mockMinGauge)
        .mockReturnValueOnce(mockMaxGauge),
    } as unknown as Meter;
  });

  test('creates three gauges with correct names and descriptions', () => {
    otelAvgMinMax = new OtelAvgMinMax(mockLogger, mockMeter, 'test_avgminmax', 'Test AvgMinMax');
    expect(mockMeter.createObservableGauge).toHaveBeenCalledWith('test_avgminmax_avg', {
      description: 'Test AvgMinMax (average)',
    });
    expect(mockMeter.createObservableGauge).toHaveBeenCalledWith('test_avgminmax_min', {
      description: 'Test AvgMinMax (minimum)',
    });
    expect(mockMeter.createObservableGauge).toHaveBeenCalledWith('test_avgminmax_max', {
      description: 'Test AvgMinMax (maximum)',
    });
  });

  test('handles empty values array', () => {
    otelAvgMinMax = new OtelAvgMinMax(mockLogger, mockMeter, 'test_avgminmax', 'Test AvgMinMax');
    otelAvgMinMax.set([]);
    expect(otelAvgMinMax['currentValues']).toEqual([]);

    const mockResult = { observe: jest.fn() };
    otelAvgMinMax['observeAvg'](mockResult);
    expect(mockResult.observe).not.toHaveBeenCalled();
  });

  test('calculates aggregations for unlabeled values', () => {
    otelAvgMinMax = new OtelAvgMinMax(mockLogger, mockMeter, 'test_avgminmax', 'Test AvgMinMax');
    const values = [6, 1, 2];
    otelAvgMinMax.set(values);

    const mockResult = { observe: jest.fn() };

    otelAvgMinMax['observeAvg'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(3);

    mockResult.observe.mockClear();
    otelAvgMinMax['observeMin'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(1);

    mockResult.observe.mockClear();
    otelAvgMinMax['observeMax'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(6);
  });

  test('calculates aggregations for labeled values', () => {
    const otelAvgMinMaxWithLabels = new OtelAvgMinMax(
      mockLogger,
      mockMeter,
      'test_avgminmax_with_labels',
      'Test AvgMinMax with labels',
      ['topic'],
    );
    const labelConfig = { topic: 'tx' };

    otelAvgMinMaxWithLabels.set(labelConfig, [6, 1, 2]);

    const mockResult = { observe: jest.fn() };

    otelAvgMinMaxWithLabels['observeAvg'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(3, labelConfig);

    mockResult.observe.mockClear();
    otelAvgMinMaxWithLabels['observeMin'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(1, labelConfig);

    mockResult.observe.mockClear();
    otelAvgMinMaxWithLabels['observeMax'](mockResult);
    expect(mockResult.observe).toHaveBeenCalledWith(6, labelConfig);
  });
});
