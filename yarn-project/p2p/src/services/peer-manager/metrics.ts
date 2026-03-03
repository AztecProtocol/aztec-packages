import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';

import { GoodByeReason, prettyGoodbyeReason } from '../reqresp/protocols/index.js';

export class PeerManagerMetrics {
  private sentGoodbyes: UpDownCounter;
  private receivedGoodbyes: UpDownCounter;
  private peerCount: Gauge;
  private healthyPeerCount: Gauge;
  private lowScoreDisconnects: UpDownCounter;
  private peerConnectionDuration: Histogram;

  private peerConnectedAt: Map<string, number> = new Map<string, number>();

  public readonly tracer: Tracer;

  constructor(
    public readonly telemetryClient: TelemetryClient = getTelemetryClient(),
    name = 'PeerManager',
  ) {
    this.tracer = telemetryClient.getTracer(name);

    const meter = telemetryClient.getMeter(name);
    const goodbyeReasonAttrs = {
      [Attributes.P2P_GOODBYE_REASON]: [
        prettyGoodbyeReason(GoodByeReason.SHUTDOWN),
        prettyGoodbyeReason(GoodByeReason.MAX_PEERS),
        prettyGoodbyeReason(GoodByeReason.LOW_SCORE),
        prettyGoodbyeReason(GoodByeReason.BANNED),
        prettyGoodbyeReason(GoodByeReason.WRONG_NETWORK),
        prettyGoodbyeReason(GoodByeReason.UNKNOWN),
      ],
    };
    this.sentGoodbyes = createUpDownCounterWithDefault(meter, Metrics.PEER_MANAGER_GOODBYES_SENT, goodbyeReasonAttrs);
    this.receivedGoodbyes = createUpDownCounterWithDefault(
      meter,
      Metrics.PEER_MANAGER_GOODBYES_RECEIVED,
      goodbyeReasonAttrs,
    );
    this.peerCount = meter.createGauge(Metrics.PEER_MANAGER_PEER_COUNT);
    this.healthyPeerCount = meter.createGauge(Metrics.PEER_MANAGER_HEALTHY_PEER_COUNT);
    this.lowScoreDisconnects = createUpDownCounterWithDefault(meter, Metrics.PEER_MANAGER_LOW_SCORE_DISCONNECTS, {
      [Attributes.P2P_PEER_SCORE_STATE]: ['Banned', 'Disconnect'],
    });
    this.peerConnectionDuration = meter.createHistogram(Metrics.PEER_MANAGER_PEER_CONNECTION_DURATION);
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

  public recordHealthyPeerCount(count: number) {
    this.healthyPeerCount.record(count);
  }

  public recordLowScoreDisconnect(scoreState: 'Banned' | 'Disconnect') {
    this.lowScoreDisconnects.add(1, { [Attributes.P2P_PEER_SCORE_STATE]: scoreState });
  }

  public peerConnected(id: PeerId) {
    this.peerConnectedAt.set(id.toString(), Date.now());
  }

  public peerDisconnected(id: PeerId) {
    const connectedAt = this.peerConnectedAt.get(id.toString());
    if (connectedAt) {
      this.peerConnectionDuration.record(Date.now() - connectedAt);
      this.peerConnectedAt.delete(id.toString());
    }
  }
}
