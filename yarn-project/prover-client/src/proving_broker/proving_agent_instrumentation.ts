import type { Timer } from '@aztec/foundation/timer';
import { type Histogram, Metrics, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

export class ProvingAgentInstrumentation {
  private idleTime: Histogram;

  constructor(client: TelemetryClient, name = 'ProvingAgent') {
    const meter = client.getMeter(name);

    this.idleTime = meter.createHistogram(Metrics.PROVING_AGENT_IDLE, {
      description: 'Records how long an agent was idle',
      unit: 's',
      valueType: ValueType.DOUBLE,
    });
  }

  recordIdleTime(msOrTimer: Timer | number) {
    const duration = typeof msOrTimer === 'number' ? msOrTimer : msOrTimer.ms();
    this.idleTime.record(duration / 1000);
  }
}
