import {
  Attributes,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { type GoodByeReason, prettyGoodbyeReason } from '../reqresp/protocols/index.js';

export class PeerManagerMetrics {
  private disconnectedPeers: UpDownCounter;

  public readonly tracer: Tracer;

  constructor(public readonly telemetryClient: TelemetryClient, name = 'PeerManager') {
    this.tracer = telemetryClient.getTracer(name);

    const meter = telemetryClient.getMeter(name);
    this.disconnectedPeers = meter.createUpDownCounter(Metrics.PEER_MANAGER_DISCONNECTED_PEERS, {
      description: 'Number of disconnected peers',
      unit: 'peers',
      valueType: ValueType.INT,
    });
  }

  public recordDisconnectedPeer(reason: GoodByeReason) {
    this.disconnectedPeers.add(1, { [Attributes.P2P_GOODBYE_REASON]: prettyGoodbyeReason(reason) });
  }
}
