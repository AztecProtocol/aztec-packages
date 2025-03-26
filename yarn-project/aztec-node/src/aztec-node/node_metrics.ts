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

  constructor(client: TelemetryClient, name = 'AztecNode') {
    const meter = client.getMeter(name);
    this.receiveTxCount = meter.createUpDownCounter(Metrics.NODE_RECEIVE_TX_COUNT, {});
    this.receiveTxDuration = meter.createHistogram(Metrics.NODE_RECEIVE_TX_DURATION, {
      description: 'The duration of the receiveTx method',
      unit: 'ms',
      valueType: ValueType.INT,
    });
  }

  receivedTx(durationMs: number, isAccepted: boolean) {
    this.receiveTxDuration.record(Math.ceil(durationMs), {
      [Attributes.OK]: isAccepted,
    });
    this.receiveTxCount.add(1, {
      [Attributes.OK]: isAccepted,
    });
  }
}
