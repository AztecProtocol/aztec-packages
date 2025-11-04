import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class NodeMetrics {
  private receiveTxCount: UpDownCounter;
  private receiveTxDuration: Histogram;

  private snapshotErrorCount: UpDownCounter;
  private snapshotDuration: Histogram;

  constructor(client: TelemetryClient, name = 'AztecNode') {
    const meter = client.getMeter(name);
    this.receiveTxCount = meter.createUpDownCounter(Metrics.NODE_RECEIVE_TX_COUNT, {});
    this.receiveTxDuration = meter.createHistogram(Metrics.NODE_RECEIVE_TX_DURATION, {
      description: 'The duration of the receiveTx method',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.snapshotDuration = meter.createHistogram(Metrics.NODE_SNAPSHOT_DURATION, {
      description: 'How long taking a snapshot takes',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.snapshotErrorCount = meter.createUpDownCounter(Metrics.NODE_SNAPSHOT_ERROR_COUNT, {
      description: 'How many snapshot errors have happened',
      valueType: ValueType.INT,
    });

    this.snapshotErrorCount.add(0);
  }

  receivedTx(durationMs: number, isAccepted: boolean) {
    this.receiveTxDuration.record(Math.ceil(durationMs), {
      [Attributes.OK]: isAccepted,
    });
    this.receiveTxCount.add(1, {
      [Attributes.OK]: isAccepted,
    });
  }

  recordSnapshot(durationMs: number) {
    if (isNaN(durationMs)) {
      return;
    }

    this.snapshotDuration.record(Math.ceil(durationMs));
  }

  recordSnapshotError() {
    this.snapshotErrorCount.add(1);
  }
}
