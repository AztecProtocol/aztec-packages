// Request response metrics
import { Attributes, Metrics, ValueType } from '@aztec/telemetry-client';
import type { Histogram, TelemetryClient, Tracer, UpDownCounter } from '@aztec/telemetry-client';

export class ReqRespMetrics {
  public readonly tracer: Tracer;

  private readonly sentRequests: UpDownCounter;
  private readonly receivedRequests: UpDownCounter;

  private readonly failedOutboundRequests: UpDownCounter;
  private readonly failedInboundRequests: UpDownCounter;
  private readonly rateLimitedInboundRequests: UpDownCounter;

  private readonly outboundDurationMs: Histogram;
  private readonly inboundHandlerDurationMs: Histogram;
  private readonly responseValidationDurationMs: Histogram;

  private readonly requestSizeBytes: Histogram;
  private readonly responseSizeBytes: Histogram;
  private readonly responseCompressedSizeBytes: Histogram;

  constructor(
    readonly telemetryClient: TelemetryClient,
    name = 'ReqResp',
  ) {
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

    this.rateLimitedInboundRequests = meter.createUpDownCounter(Metrics.P2P_REQ_RESP_RATE_LIMITED_COUNT, {
      description: 'Number of inbound requests rejected due to rate limits',
      unit: 'requests',
      valueType: ValueType.INT,
    });

    this.outboundDurationMs = meter.createHistogram(Metrics.P2P_REQ_RESP_OUTBOUND_DURATION, {
      description: 'End-to-end outbound req/resp round-trip duration',
      unit: 'ms',
      valueType: ValueType.INT,
    });
    this.inboundHandlerDurationMs = meter.createHistogram(Metrics.P2P_REQ_RESP_INBOUND_HANDLER_DURATION, {
      description: 'Time to execute inbound handler and write response',
      unit: 'ms',
      valueType: ValueType.INT,
    });
    this.responseValidationDurationMs = meter.createHistogram(Metrics.P2P_REQ_RESP_RESPONSE_VALIDATION_DURATION, {
      description: 'Time to validate a req/resp response',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.requestSizeBytes = meter.createHistogram(Metrics.P2P_REQ_RESP_REQUEST_SIZE, {
      description: 'Request payload size (bytes)',
      unit: 'By',
      valueType: ValueType.INT,
    });
    this.responseSizeBytes = meter.createHistogram(Metrics.P2P_REQ_RESP_RESPONSE_SIZE, {
      description: 'Response payload size (bytes, uncompressed)',
      unit: 'By',
      valueType: ValueType.INT,
    });
    this.responseCompressedSizeBytes = meter.createHistogram(Metrics.P2P_REQ_RESP_RESPONSE_COMPRESSED_SIZE, {
      description: 'Response payload size (bytes, compressed)',
      unit: 'By',
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

  public recordRateLimited(protocol: string) {
    this.rateLimitedInboundRequests.add(1, { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordOutboundDuration(protocol: string, durationMs: number) {
    if (isNaN(durationMs)) {
      return;
    }
    this.outboundDurationMs.record(Math.ceil(durationMs), { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordInboundHandlerDuration(protocol: string, durationMs: number) {
    if (isNaN(durationMs)) {
      return;
    }
    this.inboundHandlerDurationMs.record(Math.ceil(durationMs), { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordResponseValidationDuration(protocol: string, durationMs: number) {
    if (isNaN(durationMs)) {
      return;
    }
    this.responseValidationDurationMs.record(Math.ceil(durationMs), { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordRequestSize(protocol: string, bytes: number) {
    if (!Number.isFinite(bytes)) {
      return;
    }
    this.requestSizeBytes.record(Math.max(0, Math.floor(bytes)), { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordResponseSize(protocol: string, bytes: number) {
    if (!Number.isFinite(bytes)) {
      return;
    }
    this.responseSizeBytes.record(Math.max(0, Math.floor(bytes)), { [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol });
  }

  public recordResponseCompressedSize(protocol: string, bytes: number) {
    if (!Number.isFinite(bytes)) {
      return;
    }
    this.responseCompressedSizeBytes.record(Math.max(0, Math.floor(bytes)), {
      [Attributes.P2P_REQ_RESP_PROTOCOL]: protocol,
    });
  }
}
