// Request response metrics
import { Attributes, Metrics, ValueType } from '@aztec/telemetry-client';
import { type TelemetryClient, type Tracer, type UpDownCounter } from '@aztec/telemetry-client';

export class ReqRespMetrics {
  public readonly tracer: Tracer;

  private readonly sentRequests: UpDownCounter;
  private readonly receivedRequests: UpDownCounter;

  private readonly failedOutboundRequests: UpDownCounter;
  private readonly failedInboundRequests: UpDownCounter;

  constructor(readonly telemetryClient: TelemetryClient, name = 'ReqResp') {
    this.tracer = telemetryClient.getTracer(name);

    const meter = telemetryClient.getMeter(name);
    this.sentRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_SENT_REQUESTS, {
      description: 'Number of requests sent to peers',
      unit: 'requests',
      valueType: ValueType.INT,
    });
    this.receivedRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_RECEIVED_REQUESTS, {
      description: 'Number of requests received from peers',
      unit: 'requests',
      valueType: ValueType.INT,
    });

    this.failedOutboundRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_FAILED_OUTBOUND_REQUESTS, {
      description: 'Number of failed outbound requests - nodes not getting valid responses',
      unit: 'requests',
      valueType: ValueType.INT,
    });

    this.failedInboundRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_FAILED_INBOUND_REQUESTS, {
      description: 'Number of failed inbound requests - node failing to respond to requests',
      unit: 'requests',
      valueType: ValueType.INT,
    });
  }

  public recordRequestSent(protocol: string) {
    this.sentRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordRequestReceived(protocol: string) {
    this.receivedRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordRequestError(protocol: string) {
    this.failedOutboundRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordResponseError(protocol: string) {
    this.failedInboundRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }
}
