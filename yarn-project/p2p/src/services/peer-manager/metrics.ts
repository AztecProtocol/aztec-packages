import { Attributes, Metrics, ValueType } from '@aztec/telemetry-client';
import type { TelemetryClient, Tracer, UpDownCounter } from '@aztec/telemetry-client';

import { prettyGoodbyeReason } from '../reqresp/protocols/index.js';
import type { GoodByeReason } from '../reqresp/protocols/index.js';

export class PeerManagerMetrics {
  private sentGoodbyes: UpDownCounter;
  private receivedGoodbyes: UpDownCounter;

  public readonly tracer: Tracer;

  constructor(public readonly telemetryClient: TelemetryClient, name = 'PeerManager') {
    this.tracer = telemetryClient.getTracer(name);

    const meter = telemetryClient.getMeter(name);
    this.sentGoodbyes = meter.createUpDownCounter(Metrics.PEER_MANAGER_GOODBYES_SENT, {
      description: 'Number of goodbyes sent to peers',
      unit: 'peers',
      valueType: ValueType.INT,
    });
    this.receivedGoodbyes = meter.createUpDownCounter(Metrics.PEER_MANAGER_GOODBYES_RECEIVED, {
      description: 'Number of goodbyes received from peers',
      unit: 'peers',
      valueType: ValueType.INT,
    });
  }

  public recordGoodbyeSent(reason: GoodByeReason) {
    this.sentGoodbyes.add(1, { [Attributes.P2P_GOODBYE_REASON]: prettyGoodbyeReason(reason) });
  }

  public recordGoodbyeReceived(reason: GoodByeReason) {
    this.receivedGoodbyes.add(1, { [Attributes.P2P_GOODBYE_REASON]: prettyGoodbyeReason(reason) });
  }
}
