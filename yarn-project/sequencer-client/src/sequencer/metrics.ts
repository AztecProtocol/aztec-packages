import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { type SequencerState, type SequencerStateCallback, sequencerStateToNumber } from './utils.js';

export class SequencerMetrics {
  public readonly tracer: Tracer;

  private blockCounter: UpDownCounter;
  private blockBuildDuration: Histogram;
  private stateTransitionBufferDuration: Histogram;
  private currentBlockNumber: Gauge;
  private currentBlockSize: Gauge;
  private blockBuilderInsertions: Histogram;

  private timeToCollectAttestations: Gauge;

  constructor(client: TelemetryClient, getState: SequencerStateCallback, name = 'Sequencer') {
    const meter = client.getMeter(name);
    this.tracer = client.getTracer(name);

    this.blockCounter = meter.createUpDownCounter(Metrics.SEQUENCER_BLOCK_COUNT);
    this.blockBuildDuration = meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_DURATION, {
      unit: 'ms',
      description: 'Duration to build a block',
      valueType: ValueType.INT,
    });
    this.stateTransitionBufferDuration = meter.createHistogram(Metrics.SEQUENCER_STATE_TRANSITION_BUFFER_DURATION, {
      unit: 'ms',
      description:
        'The time difference between when the sequencer needed to transition to a new state and when it actually did.',
      valueType: ValueType.INT,
    });

    const currentState = meter.createObservableGauge(Metrics.SEQUENCER_CURRENT_STATE, {
      description: 'Current state of the sequencer',
    });

    currentState.addCallback(observer => {
      observer.observe(sequencerStateToNumber(getState()));
    });

    this.currentBlockNumber = meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_NUMBER, {
      description: 'Current block number',
      valueType: ValueType.INT,
    });

    this.currentBlockSize = meter.createGauge(Metrics.SEQUENCER_CURRENT_BLOCK_SIZE, {
      description: 'Current block size',
      valueType: ValueType.INT,
    });

    this.timeToCollectAttestations = meter.createGauge(Metrics.SEQUENCER_TIME_TO_COLLECT_ATTESTATIONS, {
      description: 'The time spent collecting attestations from committee members',
      valueType: ValueType.INT,
    });

    this.blockBuilderInsertions = meter.createHistogram(Metrics.SEQUENCER_BLOCK_BUILD_INSERTION_TIME, {
      description: 'Timer for tree insertions performed by the block builder',
      unit: 'us',
      valueType: ValueType.INT,
    });

    this.setCurrentBlock(0, 0);
  }

  startCollectingAttestationsTimer(): () => void {
    const startTime = Date.now();
    const stop = () => {
      const duration = Date.now() - startTime;
      this.recordTimeToCollectAttestations(duration);
    };
    return stop.bind(this);
  }

  recordTimeToCollectAttestations(time: number) {
    this.timeToCollectAttestations.record(time);
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

  recordPublishedBlock(buildDurationMs: number) {
    this.blockCounter.add(1, {
      [Attributes.STATUS]: 'published',
    });
    this.blockBuildDuration.record(Math.ceil(buildDurationMs));
    this.setCurrentBlock(0, 0);
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

  private setCurrentBlock(blockNumber: number, txCount: number) {
    this.currentBlockNumber.record(blockNumber);
    this.currentBlockSize.record(txCount);
  }
}
