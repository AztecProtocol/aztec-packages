// Request response metrics
import { Attributes, Metrics, createUpDownCounterWithDefault } from '@aztec/telemetry-client';
import type { TelemetryClient, Tracer, UpDownCounter } from '@aztec/telemetry-client';

import { ReqRespSubProtocol } from './interface.js';

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
    const protocolAttrs = {
      [Attributes.P2P_REQ_RESP_PROTOCOL]: [
        ReqRespSubProtocol.PING,
        ReqRespSubProtocol.STATUS,
        ReqRespSubProtocol.GOODBYE,
        ReqRespSubProtocol.TX,
        ReqRespSubProtocol.BLOCK,
        ReqRespSubProtocol.AUTH,
        ReqRespSubProtocol.BLOCK_TXS,
      ],
    };
    this.sentRequests = createUpDownCounterWithDefault(meter, Metrics.P2P_REQ_RESP_SENT_REQUESTS, protocolAttrs);
    this.receivedRequests = createUpDownCounterWithDefault(
      meter,
      Metrics.P2P_REQ_RESP_RECEIVED_REQUESTS,
      protocolAttrs,
    );

    this.failedOutboundRequests = createUpDownCounterWithDefault(
      meter,
      Metrics.P2P_REQ_RESP_FAILED_OUTBOUND_REQUESTS,
      protocolAttrs,
    );

    this.failedInboundRequests = createUpDownCounterWithDefault(
      meter,
      Metrics.P2P_REQ_RESP_FAILED_INBOUND_REQUESTS,
      protocolAttrs,
    );
  }

  public recordRequestSent(protocol: ReqRespSubProtocol) {
    this.sentRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordRequestReceived(protocol: ReqRespSubProtocol) {
    this.receivedRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordRequestError(protocol: ReqRespSubProtocol) {
    this.failedOutboundRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordResponseError(protocol: ReqRespSubProtocol) {
    this.failedInboundRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }
}
