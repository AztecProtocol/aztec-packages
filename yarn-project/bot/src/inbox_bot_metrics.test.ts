import { Attributes, Metrics, ValueType } from '@aztec/telemetry-client';

import {
  InboxBotChecks,
  InboxBotMetrics,
  InboxBotMilestones,
  type InboxBotObservedState,
  InboxBotReasons,
} from './inbox_bot_metrics.js';
import { RecordingTelemetryClient } from './test/recording_telemetry.js';

describe('InboxBotMetrics', () => {
  let telemetry: RecordingTelemetryClient;
  let metrics: InboxBotMetrics;

  const state: InboxBotObservedState = {
    pending: [
      { scenario: 'normal', count: 7, oldestAgeSeconds: 42.5 },
      { scenario: 'saturation', count: 0, oldestAgeSeconds: 0 },
    ],
    saturation: { enabled: true, lastSuccessTimestampSeconds: 1_700_000_000, nextDueTimestampSeconds: 1_700_086_400 },
  };

  beforeEach(() => {
    telemetry = new RecordingTelemetryClient();
    metrics = new InboxBotMetrics(telemetry, 'proposed', 'checkpointed');
  });

  describe('instrument contract', () => {
    it('registers every instrument with the expected name, type, unit and value type', () => {
      const expected = [
        [Metrics.BOT_INBOX_MESSAGE_COUNT, 'up_down_counter', 'messages', ValueType.INT],
        [Metrics.BOT_INBOX_STAGE_DURATION, 'histogram', 's', ValueType.DOUBLE],
        [Metrics.BOT_INBOX_SIMULATION_COUNT, 'up_down_counter', 'attempts', ValueType.INT],
        [Metrics.BOT_INBOX_PUBLIC_EXECUTION_COUNT, 'up_down_counter', 'attempts', ValueType.INT],
        [Metrics.BOT_INBOX_PREDICTION_MISMATCH_COUNT, 'up_down_counter', 'attempts', ValueType.INT],
        [Metrics.BOT_INBOX_CHECK_COUNT, 'up_down_counter', 'checks', ValueType.INT],
        [Metrics.BOT_INBOX_FAILURE_COUNT, 'up_down_counter', 'failures', ValueType.INT],
        [Metrics.BOT_INBOX_PENDING_COUNT, 'observable_gauge', 'messages', ValueType.INT],
        [Metrics.BOT_INBOX_OLDEST_PENDING_AGE, 'observable_gauge', 's', ValueType.DOUBLE],
        [Metrics.BOT_INBOX_L1_BATCH_COUNT, 'up_down_counter', 'batches', ValueType.INT],
        [Metrics.BOT_INBOX_L1_BATCH_SIZE, 'histogram', 'messages', ValueType.INT],
        [Metrics.BOT_INBOX_L1_GAS_USED, 'histogram', 'gas', ValueType.INT],
        [Metrics.BOT_INBOX_SATURATION_RUN_COUNT, 'up_down_counter', 'runs', ValueType.INT],
        [Metrics.BOT_INBOX_SATURATION_LAST_SUCCESS_TIMESTAMP, 'observable_gauge', 's', ValueType.DOUBLE],
        [Metrics.BOT_INBOX_SATURATION_ENABLED, 'observable_gauge', '1', ValueType.INT],
        [Metrics.BOT_INBOX_SATURATION_NEXT_DUE_TIMESTAMP, 'observable_gauge', 's', ValueType.DOUBLE],
      ] as const;

      expect(telemetry.meter.instruments.size).toEqual(expected.length);
      for (const [definition, kind, unit, valueType] of expected) {
        const instrument = telemetry.meter.instruments.get(definition.name);
        expect(instrument).toBeDefined();
        expect(instrument!.kind).toEqual(kind);
        expect(instrument!.definition.unit).toEqual(unit);
        expect(instrument!.definition.valueType).toEqual(valueType);
      }
    });

    it('gives every histogram explicit bucket boundaries that cover its range', () => {
      const boundaries = (name: string) =>
        telemetry.meter.instruments.get(name)!.options!.advice!.explicitBucketBoundaries!;

      const stages = boundaries(Metrics.BOT_INBOX_STAGE_DURATION.name);
      expect(stages).toEqual([0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 2400, 4800, 9600]);

      const sizes = boundaries(Metrics.BOT_INBOX_L1_BATCH_SIZE.name);
      expect(sizes).toEqual(expect.arrayContaining([1, 4, 256, 257]));

      // A four-message batch sits inside the low end and a 257-message saturation batch inside the high end.
      const gas = boundaries(Metrics.BOT_INBOX_L1_GAS_USED.name);
      expect(Math.min(...gas)).toBeLessThan(500_000);
      expect(Math.max(...gas)).toBeGreaterThan(20_000_000);
    });

    it('seeds every counter series to zero so a quiet bot still exports it', () => {
      for (const reason of InboxBotReasons) {
        expect(telemetry.meter.sum(Metrics.BOT_INBOX_FAILURE_COUNT, { [Attributes.BOT_INBOX_REASON]: reason })).toEqual(
          0,
        );
        expect(
          telemetry.meter.select(Metrics.BOT_INBOX_FAILURE_COUNT, { [Attributes.BOT_INBOX_REASON]: reason }),
        ).toHaveLength(1);
      }
      for (const milestone of InboxBotMilestones) {
        expect(
          telemetry.meter.select(Metrics.BOT_INBOX_MESSAGE_COUNT, { [Attributes.BOT_INBOX_MILESTONE]: milestone })
            .length,
        ).toBeGreaterThan(0);
      }
      for (const check of InboxBotChecks) {
        expect(
          telemetry.meter.select(Metrics.BOT_INBOX_CHECK_COUNT, { [Attributes.BOT_INBOX_CHECK]: check }),
        ).toHaveLength(2);
      }
      expect(telemetry.meter.samples.every(sample => sample.value === 0)).toBe(true);
    });

    it('labels the readiness check and the readiness stage with the anchor policy', () => {
      telemetry.meter.clear();

      metrics.recordCheck('readiness_witness', 'passed');
      metrics.recordCheck('index_match', 'passed');
      metrics.recordStage('l1_mined_to_ready', { scenario: 'normal', mode: 'private' }, 3);

      expect(telemetry.meter.samples[0].attributes[Attributes.BOT_INBOX_ANCHOR_POLICY]).toEqual('proposed');
      expect(telemetry.meter.samples[1].attributes[Attributes.BOT_INBOX_ANCHOR_POLICY]).toBeUndefined();
      expect(telemetry.meter.samples[2].attributes[Attributes.BOT_INBOX_ANCHOR_POLICY]).toEqual('proposed');
    });
  });

  describe('recording transitions', () => {
    beforeEach(() => telemetry.meter.clear());

    it('counts a milestone once, with the block relation on inclusion and the policy on completion', () => {
      metrics.recordMessageMilestone({ scenario: 'normal', mode: 'public' }, 'included', 'same_block');
      metrics.recordMessageMilestone({ scenario: 'normal', mode: 'public' }, 'completed');

      expect(
        telemetry.meter.sum(Metrics.BOT_INBOX_MESSAGE_COUNT, {
          [Attributes.BOT_INBOX_MILESTONE]: 'included',
          [Attributes.BOT_INBOX_MODE]: 'public',
          [Attributes.BOT_INBOX_BLOCK_RELATION]: 'same_block',
        }),
      ).toEqual(1);
      expect(
        telemetry.meter.sum(Metrics.BOT_INBOX_MESSAGE_COUNT, {
          [Attributes.BOT_INBOX_MILESTONE]: 'completed',
          [Attributes.BOT_INBOX_COMPLETION_POLICY]: 'checkpointed',
        }),
      ).toEqual(1);
    });

    it('reports an unknown block relation rather than omitting the label', () => {
      metrics.recordMessageMilestone({ scenario: 'saturation', mode: 'private' }, 'included');

      expect(telemetry.meter.samples[0].attributes[Attributes.BOT_INBOX_BLOCK_RELATION]).toEqual('unknown');
    });

    it('records a timeout as its own outcome and never as a latency sample', () => {
      metrics.recordMessageMilestone({ scenario: 'normal', mode: 'private' }, 'timed_out');

      expect(
        telemetry.meter.sum(Metrics.BOT_INBOX_MESSAGE_COUNT, { [Attributes.BOT_INBOX_MILESTONE]: 'timed_out' }),
      ).toEqual(1);
      expect(telemetry.meter.values(Metrics.BOT_INBOX_STAGE_DURATION)).toEqual([]);
    });

    it('leaves mining latency without a mode and gives the other stages one', () => {
      metrics.recordStage('l1_submission_to_mined', { scenario: 'normal' }, 12);
      metrics.recordStage('l1_mined_to_included', { scenario: 'normal', mode: 'public' }, 30);

      expect(telemetry.meter.samples[0].attributes[Attributes.BOT_INBOX_MODE]).toBeUndefined();
      expect(telemetry.meter.samples[0].value).toEqual(12);
      expect(telemetry.meter.samples[1].attributes[Attributes.BOT_INBOX_MODE]).toEqual('public');
    });

    it('drops a duration that a clock moving backwards would have produced', () => {
      metrics.recordStage('l1_mined_to_observed', { scenario: 'normal', mode: 'public' }, -1);
      metrics.recordStage('l1_mined_to_observed', { scenario: 'normal', mode: 'public' }, Number.NaN);

      expect(telemetry.meter.values(Metrics.BOT_INBOX_STAGE_DURATION)).toEqual([]);
    });

    it('adds only positive values to its counters', () => {
      metrics.recordSimulation('not_ready', { scenario: 'normal', mode: 'private' });
      metrics.recordFailure('reorg');
      metrics.recordPublicExecution('reverted', 'normal');
      metrics.recordPredictionMismatch('normal');
      metrics.recordSaturationRun('failed');
      metrics.recordL1Batch('success', 'saturation', { messageCount: 257, gasUsed: 21_000_000n });

      expect(telemetry.meter.samples.every(sample => sample.value > 0)).toBe(true);
      expect(telemetry.meter.values(Metrics.BOT_INBOX_L1_BATCH_SIZE)).toEqual([257]);
      expect(telemetry.meter.values(Metrics.BOT_INBOX_L1_GAS_USED)).toEqual([21_000_000]);
    });
  });

  describe('observable gauges', () => {
    beforeEach(() => telemetry.meter.clear());

    it('reports the reconciled state on every collection', async () => {
      metrics.start(() => Promise.resolve(state));

      await telemetry.meter.collect();

      expect(
        telemetry.meter.last(Metrics.BOT_INBOX_PENDING_COUNT, { [Attributes.BOT_INBOX_SCENARIO]: 'normal' }),
      ).toEqual(7);
      expect(
        telemetry.meter.last(Metrics.BOT_INBOX_OLDEST_PENDING_AGE, { [Attributes.BOT_INBOX_SCENARIO]: 'normal' }),
      ).toEqual(42.5);
      expect(
        telemetry.meter.last(Metrics.BOT_INBOX_PENDING_COUNT, { [Attributes.BOT_INBOX_SCENARIO]: 'saturation' }),
      ).toEqual(0);
      expect(telemetry.meter.last(Metrics.BOT_INBOX_SATURATION_ENABLED)).toEqual(1);
      expect(telemetry.meter.last(Metrics.BOT_INBOX_SATURATION_LAST_SUCCESS_TIMESTAMP)).toEqual(1_700_000_000);
      expect(telemetry.meter.last(Metrics.BOT_INBOX_SATURATION_NEXT_DUE_TIMESTAMP)).toEqual(1_700_086_400);
    });

    it('stops exporting once the callback is removed, and never arms two at once', async () => {
      metrics.start(() => Promise.resolve(state));
      metrics.start(() => Promise.resolve(state));
      expect(telemetry.meter.armedCallbackCount).toEqual(1);

      metrics.stop();
      metrics.stop();
      expect(telemetry.meter.armedCallbackCount).toEqual(0);

      await telemetry.meter.collect();
      expect(telemetry.meter.samples).toEqual([]);
    });

    it('reports nothing rather than zeroes when the state cannot be read', async () => {
      metrics.start(() => Promise.reject(new Error('store closed')));

      await telemetry.meter.collect();

      expect(telemetry.meter.samples).toEqual([]);
    });
  });
});
