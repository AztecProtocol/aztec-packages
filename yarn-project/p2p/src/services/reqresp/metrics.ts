// Request response metrics
import { Attributes, Metrics } from '@aztec/telemetry-client';
import type { TelemetryClient, Tracer, UpDownCounter } from '@aztec/telemetry-client';

export class ReqRespMetrics {
  public readonly tracer: Tracer;

  private readonly sentRequests: UpDownCounter;
  private readonly receivedRequests: UpDownCounter;

  private readonly failedOutboundRequests: UpDownCounter;
  private readonly failedInboundRequests: UpDownCounter;

  constructor(
    readonly telemetryClient: TelemetryClient,
    name = 'ReqResp',
  ) {
    this.tracer = telemetryClient.getTracer(name);

    const meter = telemetryClient.getMeter(name);
    this.sentRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_SENT_REQUESTS);
    this.receivedRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_RECEIVED_REQUESTS);

    this.failedOutboundRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_FAILED_OUTBOUND_REQUESTS);

    this.failedInboundRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_FAILED_INBOUND_REQUESTS);
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
