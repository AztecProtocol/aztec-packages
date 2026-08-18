import { Timer } from '@aztec/foundation/timer';

import type Koa from 'koa';

import * as Attributes from './attributes.js';
import * as Metrics from './metrics.js';
import { getTelemetryClient } from './start.js';
import type { Histogram, MetricAttributesType, TelemetryClient, UpDownCounter } from './telemetry.js';
import { ATTR_JSONRPC_METHOD, ATTR_JSONRPC_SERVICE } from './vendor/attributes.js';

const BATCH_SIZE_BUCKETS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** Fixed reasons for rejecting an RPC request before dispatching it to a registered handler. */
export type JsonRpcRejectionReason =
  | 'unauthorized'
  | 'parse_error'
  | 'invalid_request'
  | 'method_not_found'
  | 'bad_request'
  | 'internal_error';

/** Records bounded-cardinality metrics for registered JSON-RPC calls, rejected requests, and batches. */
export class JsonRpcServerMetrics {
  private readonly requestCount: UpDownCounter;
  private readonly requestDuration: Histogram;
  private readonly requestValidationDuration: Histogram;
  private readonly rejectedRequestCount: UpDownCounter;
  private readonly batchCount: UpDownCounter;
  private readonly batchDuration: Histogram;
  private readonly batchSize: Histogram;

  constructor(telemetry: TelemetryClient) {
    const meter = telemetry.getMeter('JsonRpcServer');
    this.requestCount = meter.createUpDownCounter(Metrics.JSON_RPC_SERVER_REQUEST_COUNT);
    this.requestDuration = meter.createHistogram(Metrics.JSON_RPC_SERVER_REQUEST_DURATION);
    this.requestValidationDuration = meter.createHistogram(Metrics.JSON_RPC_SERVER_REQUEST_VALIDATION_DURATION);
    this.rejectedRequestCount = meter.createUpDownCounter(Metrics.JSON_RPC_SERVER_REJECTED_REQUEST_COUNT);
    this.batchCount = meter.createUpDownCounter(Metrics.JSON_RPC_SERVER_BATCH_COUNT);
    this.batchDuration = meter.createHistogram(Metrics.JSON_RPC_SERVER_BATCH_DURATION);
    this.batchSize = meter.createHistogram(Metrics.JSON_RPC_SERVER_BATCH_SIZE, {
      advice: { explicitBucketBoundaries: BATCH_SIZE_BUCKETS },
    });
  }

  /** Records the outcome and handler duration of a registered RPC method. */
  public recordRequest(fullMethod: string, durationMs: number, ok: boolean): void {
    const [service, method] = splitJsonRpcMethod(fullMethod);
    const attributes: MetricAttributesType = {
      ...(service === undefined ? {} : { [ATTR_JSONRPC_SERVICE]: service }),
      [ATTR_JSONRPC_METHOD]: method,
      [Attributes.OK]: ok,
    };
    this.requestCount.add(1, attributes);
    this.requestDuration.record(durationMs, attributes);
  }

  /** Records a pre-dispatch rejection using a fixed reason. */
  public recordRejectedRequest(reason: JsonRpcRejectionReason): void {
    this.rejectedRequestCount.add(1, { [Attributes.JSON_RPC_REJECTION_REASON]: reason });
  }

  /** Records the duration and outcome of validating a registered RPC method's parameters. */
  public recordRequestValidation(fullMethod: string, durationMs: number, ok: boolean): void {
    const [service, method] = splitJsonRpcMethod(fullMethod);
    this.requestValidationDuration.record(durationMs, {
      ...(service === undefined ? {} : { [ATTR_JSONRPC_SERVICE]: service }),
      [ATTR_JSONRPC_METHOD]: method,
      [Attributes.OK]: ok,
    });
  }

  /** Records the outcome, processing duration, and number of calls in a batch envelope. */
  public recordBatch(size: number, durationMs: number, ok: boolean): void {
    const attributes = { [Attributes.OK]: ok };
    this.batchCount.add(1, attributes);
    this.batchDuration.record(durationMs, attributes);
    this.batchSize.record(size, attributes);
  }
}

let metricsOwner: TelemetryClient | undefined;
let metrics: JsonRpcServerMetrics | undefined;

export function getJsonRpcServerMetrics(): JsonRpcServerMetrics {
  const telemetry = getTelemetryClient();
  if (metricsOwner !== telemetry) {
    metricsOwner = telemetry;
    metrics = new JsonRpcServerMetrics(telemetry);
  }
  return metrics!;
}

export function getOtelJsonRpcServerMetricsMiddleware(
  metricsProvider: () => Pick<JsonRpcServerMetrics, 'recordBatch' | 'recordRejectedRequest'> = getJsonRpcServerMetrics,
): (ctx: Koa.Context, next: () => Promise<void>) => Promise<void> {
  return async function otelJsonRpcServerMetrics(ctx, next) {
    const timer = new Timer();
    await next();

    const requestBody = (ctx.request as { body?: unknown }).body;
    if (Array.isArray(requestBody)) {
      metricsProvider().recordBatch(requestBody.length, timer.ms(), Array.isArray(ctx.body));
    }

    for (const reason of getRejectionReasons(ctx.status, ctx.body)) {
      metricsProvider().recordRejectedRequest(reason);
    }
  };
}

export function splitJsonRpcMethod(fullMethod: string): [service: string | undefined, method: string] {
  const separator = fullMethod.indexOf('_');
  return separator === -1 ? [undefined, fullMethod] : [fullMethod.slice(0, separator), fullMethod.slice(separator + 1)];
}

function getRejectionReasons(status: number, response: unknown): JsonRpcRejectionReason[] {
  if (status === 401) {
    return ['unauthorized'];
  }

  const responses = Array.isArray(response) ? response : [response];
  return responses.flatMap(item => {
    const code = getErrorCode(item);
    if (code === -32700) {
      return ['parse_error'];
    }
    if (code === -32601) {
      return ['method_not_found'];
    }
    if (code === -32600) {
      return ['invalid_request'];
    }
    if (code === -32603) {
      return ['internal_error'];
    }
    if (code === -32000) {
      return ['bad_request'];
    }
    return [];
  });
}

function getErrorCode(response: unknown): number | undefined {
  if (!response || typeof response !== 'object' || !('error' in response)) {
    return undefined;
  }
  const error = response.error;
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
    ? error.code
    : undefined;
}
