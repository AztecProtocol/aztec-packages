import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  type Meter,
  type MetricAttributesType,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

/**
 * Bounded attribute value sets and the OTel instruments for the inbox bot.
 *
 * Every value that reaches a metric label must come from one of the unions below. None of them may carry a
 * hash, address, index, block or bucket number, batch id, exception text or timestamp: those belong in logs and
 * spans, where cardinality is not a cost. The attribute keys themselves live in `@aztec/telemetry-client`'s
 * `attributes.ts`, and the instrument definitions in its `metrics.ts`.
 *
 * Durations are **bot-observed** latencies: each is the gap between two local observations, so it includes the
 * bot's own polling delay and is always at least as long as the chain-level latency it approximates. Real L1
 * block timestamps are preserved in logs, never in metrics.
 *
 * Counters are `UpDownCounter`s that only ever move up, because the telemetry wrapper has no monotonic counter.
 * They describe observations and are never decremented; a reorg is reported as its own failure rather than by
 * taking an earlier observation back. Known attribute combinations are seeded to 0 so a quiet bot still exports
 * every series an operator's dashboard queries.
 *
 * Export is **not** exactly-once. The caller persists a marker after handing a sample to an instrument, but an
 * OTel export and a KV commit cannot be made atomic: a crash between the two loses the marker and the sample is
 * exported again on restart, or loses the export and the marker suppresses it forever. The markers keep a routine
 * restart or retry from double counting; they do not promise exactly-once delivery.
 */

/** L2 domain a message is consumed through. */
export const InboxBotModes = ['public', 'private'] as const;
export type InboxBotMode = (typeof InboxBotModes)[number];

/** Kind of batch a message belongs to. */
export const InboxBotScenarios = ['normal', 'saturation'] as const;
export type InboxBotScenario = (typeof InboxBotScenarios)[number];

/** Stage of the message lifecycle a duration sample covers. */
export const InboxBotStages = [
  'l1_submission_to_mined',
  'l1_mined_to_observed',
  'l1_mined_to_ready',
  'l1_mined_to_included',
  'l1_mined_to_completed',
] as const;
export type InboxBotStage = (typeof InboxBotStages)[number];

/** Milestone a message reached. */
export const InboxBotMilestones = [
  'sent',
  'observed',
  'ready',
  'included',
  'completed',
  'timed_out',
  'failed',
] as const;
export type InboxBotMilestone = (typeof InboxBotMilestones)[number];

/** Relation between the block that inserted a message and the block that consumed it. */
export const InboxBotBlockRelations = ['same_block', 'later_block', 'unknown'] as const;
export type InboxBotBlockRelation = (typeof InboxBotBlockRelations)[number];

/** Node API semantic check being recorded. */
export const InboxBotChecks = [
  'unknown_message',
  'event_integrity',
  'index_match',
  'readiness_witness',
  'consumption_nullifier',
  'replay_rejection',
  'bucket_rollover',
] as const;
export type InboxBotCheck = (typeof InboxBotChecks)[number];

/** Bounded reason a message or batch failed. */
export const InboxBotReasons = [
  'l1_submission',
  'l1_revert',
  'rpc',
  'simulation',
  'l2_drop',
  'l2_revert',
  'timeout',
  'api_inconsistency',
  'invalid_witness',
  'invalid_consumption',
  'replay_accepted',
  'bucket_mismatch',
  'reorg',
] as const;
export type InboxBotReason = (typeof InboxBotReasons)[number];

/** Chain tip a readiness check is anchored at. */
export const InboxBotAnchorPolicies = ['latest', 'proposed', 'checkpointed', 'proven', 'finalized'] as const;
export type InboxBotAnchorPolicy = (typeof InboxBotAnchorPolicies)[number];

/** Chain tip a message must reach to count as completed. */
export const InboxBotCompletionPolicies = ['proposed', 'checkpointed', 'proven'] as const;
export type InboxBotCompletionPolicy = (typeof InboxBotCompletionPolicies)[number];

/** Outcome of a consumption simulation. */
export const InboxBotSimulationResults = ['accepted', 'not_ready', 'error'] as const;
export type InboxBotSimulationResult = (typeof InboxBotSimulationResults)[number];

/** Outcome of a public consumption execution. */
export const InboxBotPublicExecutionResults = ['success', 'reverted'] as const;
export type InboxBotPublicExecutionResult = (typeof InboxBotPublicExecutionResults)[number];

/** Outcome of a node API semantic check. */
export const InboxBotCheckResults = ['passed', 'failed'] as const;
export type InboxBotCheckResult = (typeof InboxBotCheckResults)[number];

/** Outcome of an L1 batch submission. */
export const InboxBotL1BatchResults = ['success', 'reverted'] as const;
export type InboxBotL1BatchResult = (typeof InboxBotL1BatchResults)[number];

/** Outcome of a saturation run. */
export const InboxBotSaturationRunResults = ['started', 'success', 'failed'] as const;
export type InboxBotSaturationRunResult = (typeof InboxBotSaturationRunResults)[number];

/** Meter and tracer name the inbox bot's telemetry is published under. */
export const INBOX_BOT_TELEMETRY_NAME = 'InboxBot';

/**
 * Bucket boundaries in seconds for the message lifecycle stages. The low end resolves a message absorbed by the
 * very next block; the high end still separates a message that took an hour from one that took three.
 */
const STAGE_DURATION_BUCKETS_SECONDS = [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 2400, 4800, 9600];

/** Batch sizes, with the ordinary default of 4 and both sides of the 256-message bucket boundary resolved. */
const L1_BATCH_SIZE_BUCKETS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 257];

/** L1 gas, spanning a four-message batch at the low end and a 257-message saturation batch at the high end. */
const L1_GAS_USED_BUCKETS = [
  250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 12_000_000, 16_000_000, 20_000_000,
  25_000_000, 30_000_000,
];

/** The labels every message-scoped instrument carries. */
export interface InboxBotMessageLabels {
  scenario: InboxBotScenario;
  mode: InboxBotMode;
}

/** Messages of one scenario that the bot is still following. */
export interface InboxBotPendingState {
  scenario: InboxBotScenario;
  /** Messages produced and not yet completed, timed out or failed. */
  count: number;
  /** Age of the oldest such message in seconds, or 0 when there are none. */
  oldestAgeSeconds: number;
}

/** Saturation schedule as the gauges report it. Timestamps are unix seconds; 0 means none, or disabled. */
export interface InboxBotSaturationState {
  enabled: boolean;
  lastSuccessTimestampSeconds: number;
  nextDueTimestampSeconds: number;
}

/** Reconciled durable state the observable gauges report, read afresh on every collection. */
export interface InboxBotObservedState {
  pending: InboxBotPendingState[];
  saturation: InboxBotSaturationState;
}

/**
 * The inbox bot's OTel instruments.
 *
 * Attributes are attached per instrument rather than uniformly: `mode` labels message-scoped metrics only, since
 * a batch carries messages of both domains and has no meaningful mode of its own. Mining latency is therefore a
 * batch-scoped sample with no mode, while the four later stages are per message.
 *
 * The observable gauges are registered by {@link start} and torn down by {@link stop}, so a bot that is recreated
 * — as `BotRunner.update()` does — never leaves a second callback exporting from the old instance's state.
 */
export class InboxBotMetrics {
  public readonly tracer: Tracer;

  private readonly meter: Meter;

  private readonly messageCount: UpDownCounter;
  private readonly stageDuration: Histogram;
  private readonly simulationCount: UpDownCounter;
  private readonly publicExecutionCount: UpDownCounter;
  private readonly predictionMismatchCount: UpDownCounter;
  private readonly checkCount: UpDownCounter;
  private readonly failureCount: UpDownCounter;
  private readonly l1BatchCount: UpDownCounter;
  private readonly l1BatchSize: Histogram;
  private readonly l1GasUsed: Histogram;
  private readonly saturationRunCount: UpDownCounter;

  private readonly pendingCount: ObservableGauge;
  private readonly oldestPendingAge: ObservableGauge;
  private readonly saturationEnabled: ObservableGauge;
  private readonly saturationLastSuccess: ObservableGauge;
  private readonly saturationNextDue: ObservableGauge;
  private readonly observables: ObservableGauge[];

  private readState?: () => Promise<InboxBotObservedState>;

  public constructor(
    client: TelemetryClient,
    private readonly anchorPolicy: InboxBotAnchorPolicy,
    private readonly completionPolicy: InboxBotCompletionPolicy,
    private readonly log: Logger = createLogger('bot:inbox:metrics'),
  ) {
    this.meter = client.getMeter(INBOX_BOT_TELEMETRY_NAME);
    this.tracer = client.getTracer(INBOX_BOT_TELEMETRY_NAME);

    this.messageCount = createUpDownCounterWithDefault(
      this.meter,
      Metrics.BOT_INBOX_MESSAGE_COUNT,
      this.messageCountSeeds(),
    );
    this.stageDuration = this.meter.createHistogram(Metrics.BOT_INBOX_STAGE_DURATION, {
      advice: { explicitBucketBoundaries: STAGE_DURATION_BUCKETS_SECONDS },
    });
    this.simulationCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_SIMULATION_COUNT, {
      [Attributes.BOT_INBOX_RESULT]: [...InboxBotSimulationResults],
      [Attributes.BOT_INBOX_MODE]: [...InboxBotModes],
      [Attributes.BOT_INBOX_SCENARIO]: [...InboxBotScenarios],
    });
    this.publicExecutionCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_PUBLIC_EXECUTION_COUNT, {
      [Attributes.BOT_INBOX_RESULT]: [...InboxBotPublicExecutionResults],
      [Attributes.BOT_INBOX_SCENARIO]: [...InboxBotScenarios],
    });
    this.predictionMismatchCount = createUpDownCounterWithDefault(
      this.meter,
      Metrics.BOT_INBOX_PREDICTION_MISMATCH_COUNT,
      { [Attributes.BOT_INBOX_SCENARIO]: [...InboxBotScenarios] },
    );
    this.checkCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_CHECK_COUNT, this.checkSeeds());
    this.failureCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_FAILURE_COUNT, {
      [Attributes.BOT_INBOX_REASON]: [...InboxBotReasons],
    });
    this.l1BatchCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_L1_BATCH_COUNT, {
      [Attributes.BOT_INBOX_RESULT]: [...InboxBotL1BatchResults],
      [Attributes.BOT_INBOX_SCENARIO]: [...InboxBotScenarios],
    });
    this.l1BatchSize = this.meter.createHistogram(Metrics.BOT_INBOX_L1_BATCH_SIZE, {
      advice: { explicitBucketBoundaries: L1_BATCH_SIZE_BUCKETS },
    });
    this.l1GasUsed = this.meter.createHistogram(Metrics.BOT_INBOX_L1_GAS_USED, {
      advice: { explicitBucketBoundaries: L1_GAS_USED_BUCKETS },
    });
    this.saturationRunCount = createUpDownCounterWithDefault(this.meter, Metrics.BOT_INBOX_SATURATION_RUN_COUNT, {
      [Attributes.BOT_INBOX_RESULT]: [...InboxBotSaturationRunResults],
    });

    this.pendingCount = this.meter.createObservableGauge(Metrics.BOT_INBOX_PENDING_COUNT);
    this.oldestPendingAge = this.meter.createObservableGauge(Metrics.BOT_INBOX_OLDEST_PENDING_AGE);
    this.saturationEnabled = this.meter.createObservableGauge(Metrics.BOT_INBOX_SATURATION_ENABLED);
    this.saturationLastSuccess = this.meter.createObservableGauge(Metrics.BOT_INBOX_SATURATION_LAST_SUCCESS_TIMESTAMP);
    this.saturationNextDue = this.meter.createObservableGauge(Metrics.BOT_INBOX_SATURATION_NEXT_DUE_TIMESTAMP);
    this.observables = [
      this.pendingCount,
      this.oldestPendingAge,
      this.saturationEnabled,
      this.saturationLastSuccess,
      this.saturationNextDue,
    ];
  }

  /**
   * Arms the observable gauges against a reader of the bot's reconciled durable state. Idempotent: a second call
   * re-arms with the new reader rather than adding a second callback.
   */
  public start(readState: () => Promise<InboxBotObservedState>): void {
    this.stop();
    this.readState = readState;
    this.meter.addBatchObservableCallback(this.observe, this.observables);
  }

  /** Tears down the observable callback armed by {@link start}. Idempotent. */
  public stop(): void {
    if (this.readState === undefined) {
      return;
    }
    this.readState = undefined;
    this.meter.removeBatchObservableCallback(this.observe, this.observables);
  }

  /**
   * Records that a message reached a milestone. `included` carries how the consuming block related to the block
   * that inserted the message, and `completed` the chain tip the operator configured as completion.
   */
  public recordMessageMilestone(
    labels: InboxBotMessageLabels,
    milestone: InboxBotMilestone,
    blockRelation?: InboxBotBlockRelation,
  ): void {
    const attributes: MetricAttributesType = {
      [Attributes.BOT_INBOX_MILESTONE]: milestone,
      [Attributes.BOT_INBOX_MODE]: labels.mode,
      [Attributes.BOT_INBOX_SCENARIO]: labels.scenario,
    };
    if (milestone === 'included') {
      attributes[Attributes.BOT_INBOX_BLOCK_RELATION] = blockRelation ?? 'unknown';
    }
    if (milestone === 'completed') {
      attributes[Attributes.BOT_INBOX_COMPLETION_POLICY] = this.completionPolicy;
    }
    this.messageCount.add(1, attributes);
  }

  /**
   * Records one stage latency in seconds. `l1_submission_to_mined` is a batch-scoped sample and passes no mode;
   * the other four are per message. A negative or non-finite duration is dropped rather than skewing the
   * histogram: it can only come from a clock that moved backwards between the two observations.
   */
  public recordStage(
    stage: InboxBotStage,
    labels: { scenario: InboxBotScenario; mode?: InboxBotMode },
    seconds: number,
  ): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      this.log.debug(`Dropping an impossible inbox stage duration`, { stage, seconds, ...labels });
      return;
    }
    const attributes: MetricAttributesType = {
      [Attributes.BOT_INBOX_STAGE]: stage,
      [Attributes.BOT_INBOX_SCENARIO]: labels.scenario,
    };
    if (labels.mode !== undefined) {
      attributes[Attributes.BOT_INBOX_MODE] = labels.mode;
    }
    if (stage === 'l1_mined_to_ready') {
      attributes[Attributes.BOT_INBOX_ANCHOR_POLICY] = this.anchorPolicy;
    }
    if (stage === 'l1_mined_to_completed') {
      attributes[Attributes.BOT_INBOX_COMPLETION_POLICY] = this.completionPolicy;
    }
    this.stageDuration.record(seconds, attributes);
  }

  public recordSimulation(result: InboxBotSimulationResult, labels: InboxBotMessageLabels): void {
    this.simulationCount.add(1, {
      [Attributes.BOT_INBOX_RESULT]: result,
      [Attributes.BOT_INBOX_MODE]: labels.mode,
      [Attributes.BOT_INBOX_SCENARIO]: labels.scenario,
    });
  }

  public recordPublicExecution(result: InboxBotPublicExecutionResult, scenario: InboxBotScenario): void {
    this.publicExecutionCount.add(1, {
      [Attributes.BOT_INBOX_RESULT]: result,
      [Attributes.BOT_INBOX_SCENARIO]: scenario,
    });
  }

  public recordPredictionMismatch(scenario: InboxBotScenario): void {
    this.predictionMismatchCount.add(1, { [Attributes.BOT_INBOX_SCENARIO]: scenario });
  }

  /** Records the outcome of a node API semantic check. Readiness is labelled with the tip it was checked at. */
  public recordCheck(check: InboxBotCheck, result: InboxBotCheckResult): void {
    const attributes: MetricAttributesType = {
      [Attributes.BOT_INBOX_CHECK]: check,
      [Attributes.BOT_INBOX_RESULT]: result,
    };
    if (check === 'readiness_witness') {
      attributes[Attributes.BOT_INBOX_ANCHOR_POLICY] = this.anchorPolicy;
    }
    this.checkCount.add(1, attributes);
  }

  public recordFailure(reason: InboxBotReason): void {
    this.failureCount.add(1, { [Attributes.BOT_INBOX_REASON]: reason });
  }

  /** Records an L1 batch outcome, together with its size and the gas it burned. */
  public recordL1Batch(
    result: InboxBotL1BatchResult,
    scenario: InboxBotScenario,
    args: { messageCount: number; gasUsed: bigint },
  ): void {
    this.l1BatchCount.add(1, {
      [Attributes.BOT_INBOX_RESULT]: result,
      [Attributes.BOT_INBOX_SCENARIO]: scenario,
    });
    this.l1BatchSize.record(args.messageCount, { [Attributes.BOT_INBOX_SCENARIO]: scenario });
    this.l1GasUsed.record(Number(args.gasUsed), { [Attributes.BOT_INBOX_SCENARIO]: scenario });
  }

  public recordSaturationRun(result: InboxBotSaturationRunResult): void {
    this.saturationRunCount.add(1, { [Attributes.BOT_INBOX_RESULT]: result });
  }

  private observe = async (observer: BatchObservableResult): Promise<void> => {
    const readState = this.readState;
    if (readState === undefined) {
      return;
    }
    let state: InboxBotObservedState;
    try {
      state = await readState();
    } catch (err) {
      // A collection that cannot read the store reports nothing rather than a zero that reads as "all drained".
      this.log.warn(`Could not read inbox bot state for its observable gauges`, { err });
      return;
    }

    for (const pending of state.pending) {
      const attributes = { [Attributes.BOT_INBOX_SCENARIO]: pending.scenario };
      observer.observe(this.pendingCount, pending.count, attributes);
      observer.observe(this.oldestPendingAge, pending.oldestAgeSeconds, attributes);
    }
    observer.observe(this.saturationEnabled, state.saturation.enabled ? 1 : 0);
    observer.observe(this.saturationLastSuccess, state.saturation.lastSuccessTimestampSeconds);
    observer.observe(this.saturationNextDue, state.saturation.nextDueTimestampSeconds);
  };

  private messageCountSeeds(): MetricAttributesType[] {
    const seeds: MetricAttributesType[] = [];
    for (const milestone of InboxBotMilestones) {
      for (const mode of InboxBotModes) {
        for (const scenario of InboxBotScenarios) {
          const base: MetricAttributesType = {
            [Attributes.BOT_INBOX_MILESTONE]: milestone,
            [Attributes.BOT_INBOX_MODE]: mode,
            [Attributes.BOT_INBOX_SCENARIO]: scenario,
          };
          if (milestone === 'included') {
            for (const relation of InboxBotBlockRelations) {
              seeds.push({ ...base, [Attributes.BOT_INBOX_BLOCK_RELATION]: relation });
            }
          } else if (milestone === 'completed') {
            seeds.push({ ...base, [Attributes.BOT_INBOX_COMPLETION_POLICY]: this.completionPolicy });
          } else {
            seeds.push(base);
          }
        }
      }
    }
    return seeds;
  }

  private checkSeeds(): MetricAttributesType[] {
    const seeds: MetricAttributesType[] = [];
    for (const check of InboxBotChecks) {
      for (const result of InboxBotCheckResults) {
        const base: MetricAttributesType = {
          [Attributes.BOT_INBOX_CHECK]: check,
          [Attributes.BOT_INBOX_RESULT]: result,
        };
        seeds.push(
          check === 'readiness_witness' ? { ...base, [Attributes.BOT_INBOX_ANCHOR_POLICY]: this.anchorPolicy } : base,
        );
      }
    }
    return seeds;
  }
}
