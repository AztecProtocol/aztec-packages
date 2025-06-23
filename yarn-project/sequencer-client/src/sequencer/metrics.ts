import type { EthAddress } from '@aztec/aztec.js';
import type { RollupContract } from '@aztec/ethereum';
import {
  Attributes,
  type BatchObservableResult,
  type Gauge,
  type Histogram,
  type Meter,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { formatUnits } from 'viem';

import { type SequencerState, type SequencerStateCallback, sequencerStateToNumber } from './utils.js';

export class SequencerMetrics {
  public readonly tracer: Tracer;
  private meter: Meter;

  private blockCounter: UpDownCounter;
  private blockBuildDuration: Histogram;
  private blockBuildManaPerSecond: Gauge;
  private stateTransitionBufferDuration: Histogram;
  private currentBlockNumber: Gauge;
  private currentBlockSize: Gauge;
  private blockBuilderInsertions: Histogram;

  // these are gauges because for individual sequencers building a block is not something that happens often enough to warrant a histogram
  private timeToCollectAttestations: Gauge;
  private allowanceToCollectAttestations: Gauge;
  private requiredAttestions: Gauge;
  private collectedAttestions: Gauge;

  private rewards: ObservableGauge;

  private slots: UpDownCounter;
  private filledSlots: UpDownCounter;
  private missedSlots: UpDownCounter;

  private lastSeenSlot?: bigint;

  constructor(
    client: TelemetryClient,
    getState: SequencerStateCallback,
    private coinbase: EthAddress,
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

    const currentState = this.meter.createObservableGauge(Metrics.SEQUENCER_CURRENT_STATE, {
      description: 'Current state of the sequencer',
    });

    currentState.addCallback(observer => {
      observer.observe(sequencerStateToNumber(getState()));
    });

    this.currentBlockNumber = this.meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_NUMBER, {
      description: 'Current block number',
      valueType: ValueType.INT,
    });

    this.currentBlockSize = this.meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_SIZE, {
      description: 'Current block size',
      valueType: ValueType.INT,
    });

    this.blockBuilderInsertions = this.meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_INSERTION_TIME, {
      description: 'Timer for tree insertions performed by the block builder',
      unit: 'us',
      valueType: ValueType.INT,
    });

    // Init gauges and counters
    this.setCurrentBlock(0, 0);
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'cancelled',
    });
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'failed',
    });
    this.blockCounter.add(0, {
      [Attributes.STATUS]: 'built',
    });

    this.rewards = this.meter.createObservableGauge(Metrics.SEQUENCER_CURRENT_BLOCK_REWARDS, {
      valueType: ValueType.DOUBLE,
      description: 'The rewards earned',
    });

    this.slots = this.meter.createUpDownCounter(Metrics.SEQUENCER_SLOT_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of slots this sequencer was selected for',
    });

    this.filledSlots = this.meter.createUpDownCounter(Metrics.SEQUENCER_FILLED_SLOT_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of slots this sequencer has filled',
    });

    this.missedSlots = this.meter.createUpDownCounter(Metrics.SEQUENCER_MISSED_SLOT_COUNT, {
      valueType: ValueType.INT,
      description: 'The number of slots this sequencer has missed to fill',
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

  public setCoinbase(coinbase: EthAddress) {
    this.coinbase = coinbase;
  }

  public start() {
    this.meter.addBatchObservableCallback(this.observe, [this.rewards]);
  }

  public stop() {
    this.meter.removeBatchObservableCallback(this.observe, [this.rewards]);
  }

  private observe = async (observer: BatchObservableResult): Promise<void> => {
    let rewards = 0n;
    rewards = await this.rollup.getSequencerRewards(this.coinbase);

    const fmt = parseFloat(formatUnits(rewards, 18));
    observer.observe(this.rewards, fmt, {
      [Attributes.COINBASE]: this.coinbase.toString(),
    });
  };

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

  recordBlockBuilderTreeInsertions(timeUs: number) {
    this.blockBuilderInsertions.record(Math.ceil(timeUs));
  }

  recordCancelledBlock() {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'cancelled',
    });
    this.setCurrentBlock(0, 0);
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
    this.setCurrentBlock(0, 0);
  }

  recordNewBlock(blockNumber: number, txCount: number) {
    this.setCurrentBlock(blockNumber, txCount);
  }

  recordStateTransitionBufferMs(durationMs: number, state: SequencerState) {
    this.stateTransitionBufferDuration.record(durationMs, {
      [Attributes.SEQUENCER_STATE]: state,
    });
  }

  observeSlotChange(slot: bigint | undefined, proposer: string) {
    // sequencer went through the loop a second time. Noop
    if (slot === this.lastSeenSlot) {
      return;
    }

    if (typeof this.lastSeenSlot === 'bigint') {
      this.missedSlots.add(1, {
        [Attributes.BLOCK_PROPOSER]: proposer,
      });
    }

    if (typeof slot === 'bigint') {
      this.slots.add(1, {
        [Attributes.BLOCK_PROPOSER]: proposer,
      });
    }

    this.lastSeenSlot = slot;
  }

  incFilledSlot(proposer: string) {
    this.filledSlots.add(1, {
      [Attributes.BLOCK_PROPOSER]: proposer,
    });
    this.lastSeenSlot = undefined;
  }

  private setCurrentBlock(blockNumber: number, txCount: number) {
    this.currentBlockNumber.record(blockNumber);
    this.currentBlockSize.record(txCount);
  }
}
