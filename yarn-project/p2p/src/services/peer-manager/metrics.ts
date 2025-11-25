import {
  Attributes,
  type Gauge,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { type GoodByeReason, prettyGoodbyeReason } from '../reqresp/protocols/index.js';

export class PeerManagerMetrics {
  private sentGoodbyes: UpDownCounter;
  private receivedGoodbyes: UpDownCounter;
  private peerCount: Gauge;
  private lowScoreDisconnects: UpDownCounter;

  public readonly tracer: Tracer;

  constructor(
    public readonly telemetryClient: TelemetryClient = getTelemetryClient(),
    name = 'PeerManager',
  ) {
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
    this.peerCount = meter.createGauge(Metrics.PEER_MANAGER_PEER_COUNT, {
      description: 'Number of peers',
      unit: 'peers',
      valueType: ValueType.INT,
    });
    this.lowScoreDisconnects = meter.createUpDownCounter(Metrics.PEER_MANAGER_LOW_SCORE_DISCONNECTS, {
      description: 'Number of peers disconnected due to low score',
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

  public recordPeerCount(count: number) {
    this.peerCount.record(count);
  }

  public recordLowScoreDisconnect(scoreState: 'Banned' | 'Disconnect') {
    this.lowScoreDisconnects.add(1, { [Attributes.P2P_PEER_SCORE_STATE]: scoreState });
  }
}
