import type { Timer } from '@aztec/foundation/timer';
import type { TopicType } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class P2PInstrumentation {
  private messageValidationDuration: Histogram;
  private messagePrevalidationCount: UpDownCounter;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.messageValidationDuration = meter.createHistogram(Metrics.P2P_GOSSIP_MESSAGE_VALIDATION_DURATION, {
      unit: 'ms',
      description: 'How long validating a gossiped message takes',
      valueType: ValueType.INT,
    });

    this.messagePrevalidationCount = meter.createUpDownCounter(Metrics.P2P_GOSSIP_MESSAGE_PREVALIDATION_COUNT, {
      description: 'How many message pass/fail prevalidation',
      valueType: ValueType.INT,
    });
  }

  public recordMessageValidation(topicName: TopicType, timerOrMs: Timer | number) {
    const ms = typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms();
    this.messageValidationDuration.record(Math.ceil(ms), { [Attributes.TOPIC_NAME]: topicName });
  }

  public incMessagePrevalidationStatus(passed: boolean, topicName: TopicType | undefined) {
    this.messagePrevalidationCount.add(1, { [Attributes.TOPIC_NAME]: topicName, [Attributes.OK]: passed });
  }
}
