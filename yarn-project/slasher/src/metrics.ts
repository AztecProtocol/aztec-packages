import {
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

export class SlasherMetrics {
  private readonly roundExecuted: UpDownCounter;

  constructor(client: TelemetryClient, name = 'Slasher') {
    const meter = client.getMeter(name);
    this.roundExecuted = createUpDownCounterWithDefault(meter, Metrics.SLASHER_ROUND_EXECUTED_COUNT);
  }

  public recordRoundExecuted(): void {
    this.roundExecuted.add(1);
  }
}
