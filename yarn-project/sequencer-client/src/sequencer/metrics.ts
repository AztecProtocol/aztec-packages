import type { EthAddress } from '@aztec/aztec.js';
import type { RollupContract } from '@aztec/ethereum';
import {
  Attributes,
  type Gauge,
  type Histogram,
  type Meter,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { type Hex, formatUnits } from 'viem';

import type { SequencerState } from './utils.js';

export class SequencerMetrics {
  public readonly tracer: Tracer;
  private meter: Meter;

  private blockCounter: UpDownCounter;
  private blockBuildDuration: Histogram;
  private blockBuildManaPerSecond: Gauge;
  private stateTransitionBufferDuration: Histogram;

  // these are gauges because for individual sequencers building a block is not something that happens often enough to warrant a histogram
  private timeToCollectAttestations: Gauge;
  private allowanceToCollectAttestations: Gauge;
  private requiredAttestions: Gauge;
  private collectedAttestions: Gauge;

  private rewards: Gauge;

  private slots: UpDownCounter;
  private filledSlots: UpDownCounter;

  private lastSeenSlot?: bigint;

  constructor(
    client: TelemetryClient,
    private rollup: RollupContract,
    name = 'Sequencer',
  ) {
    this.meter = client.getMeter(name);
    this.tracer = client.getTracer(name);

    this.blockCounter = this.meter.createUpDownCounter(Metrics.SEQUENCER_BLOCK_COUNT);

    this.blockBuildDuration = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_DURATION, {
      unit: 'ms',
      description: 'Duration to build a block',
      valueType: ValueType.INT,
    });

    this.blockBuildManaPerSecond = this.meter.createGauge(Metrics.SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND, {
      unit: 'mana/s',
      description: 'Mana per second when building a block',
      valueType: ValueType.INT,
    });

    this.stateTransitionBufferDuration = this.meter.createHistogram(
      Metrics.SEQUENCER_STATE_TRANSITION_BUFFER_DURATION,
      {
        unit: 'ms',
        description:
          'The time difference between when the sequencer needed to transition to a new state and when it actually did.',
        valueType: ValueType.INT,
      },
    );

    // Init gauges and counters
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'failed',
    });
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'built',
    });

    this.rewards = this.meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_REWARDS, {
      valueType: ValueType.DOUBLE,
      description: 'The rewards earned',
    });

    this.slots = this.meter.createUpDownCounter(Metrics.SEQUENCER_SLOT_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of slots this sequencer was selected for',
    });

    /**
     * NOTE: we do not track missed slots as a separate metric. That would be difficult to determine
     * Instead, use a computed metric, `slots - filledSlots` to get the number of slots a sequencer has missed.
     */
    this.filledSlots = this.meter.createUpDownCounter(Metrics.SEQUENCER_FILLED_SLOT_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of slots this sequencer has filled',
    });

    this.timeToCollectAttestations = this.meter.createGauge(Metrics.SEQUENCER_COLLECT_ATTESTATIONS_DURATION, {
      description: 'The time spent collecting attestations from committee members',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.allowanceToCollectAttestations = this.meter.createGauge(
      Metrics.SEQUENCER_COLLECT_ATTESTATIONS_TIME_ALLOWANCE,
      {
        description: 'Maximum amount of time to collect attestations',
        unit: 'ms',
        valueType: ValueType.INT,
      },
    );

    this.requiredAttestions = this.meter.createGauge(Metrics.SEQUENCER_REQUIRED_ATTESTATIONS_COUNT, {
      valueType: ValueType.INT,
      description: 'The minimum number of attestations required to publish a block',
    });

    this.collectedAttestions = this.meter.createGauge(Metrics.SEQUENCER_COLLECTED_ATTESTATIONS_COUNT, {
      valueType: ValueType.INT,
      description: 'The minimum number of attestations required to publish a block',
    });
  }

  public recordRequiredAttestations(requiredAttestationsCount: number, allowanceMs: number) {
    this.requiredAttestions.record(requiredAttestationsCount);
    this.allowanceToCollectAttestations.record(Math.ceil(allowanceMs));

    // reset
    this.collectedAttestions.record(0);
    this.timeToCollectAttestations.record(0);
  }

  public recordCollectedAttestations(count: number, durationMs: number) {
    this.collectedAttestions.record(count);
    this.timeToCollectAttestations.record(Math.ceil(durationMs));
  }

  recordBuiltBlock(buildDurationMs: number, totalMana: number) {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'built',
    });
    this.blockBuildDuration.record(Math.ceil(buildDurationMs));
    this.blockBuildManaPerSecond.record(Math.ceil((totalMana * 1000) / buildDurationMs));
  }

  recordFailedBlock() {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'failed',
    });
  }

  recordStateTransitionBufferMs(durationMs: number, state: SequencerState) {
    this.stateTransitionBufferDuration.record(durationMs, {
      [Attributes.SEQUENCER_STATE]: state,
    });
  }

  incOpenSlot(slot: bigint, proposer: string) {
    // sequencer went through the loop a second time. Noop
    if (slot === this.lastSeenSlot) {
      return;
    }

    this.slots.add(1, {
      [Attributes.BLOCK_PROPOSER]: proposer,
    });

    this.lastSeenSlot = slot;
  }

  async incFilledSlot(proposer: string, coinbase: Hex | EthAddress | undefined): Promise<void> {
    this.filledSlots.add(1, {
      [Attributes.BLOCK_PROPOSER]: proposer,
    });
    this.lastSeenSlot = undefined;

    if (coinbase) {
      try {
        const rewards = await this.rollup.getSequencerRewards(coinbase);
        const fmt = parseFloat(formatUnits(rewards, 18));
        this.rewards.record(fmt, {
          [Attributes.COINBASE]: coinbase.toString(),
        });
      } catch {
        // no-op
      }
    }
  }
}
