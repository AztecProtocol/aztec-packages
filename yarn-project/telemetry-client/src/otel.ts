import { type LogData, type Logger, addLogDataHandler } from '@aztec/foundation/log';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  type Meter,
  type Tracer,
  type TracerProvider,
  context,
  diag,
  isSpanContextValid,
  trace,
} from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { type IResource } from '@opentelemetry/resources';
import { type LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
  View,
} from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { type TelemetryClientConfig } from './config.js';
import { linearBuckets } from './histogram_utils.js';
import { registerOtelLoggerProvider } from './otel_logger_provider.js';
import { getOtelResource } from './otel_resource.js';
import { type Gauge, type TelemetryClient } from './telemetry.js';

export class OpenTelemetryClient implements TelemetryClient {
  hostMetrics: HostMetrics | undefined;
  targetInfo: Gauge | undefined;
  private meters: Map<string, Meter> = new Map<string, Meter>();
  private tracers: Map<string, Tracer> = new Map<string, Tracer>();

  protected constructor(
    private resource: IResource,
    private meterProvider: MeterProvider,
    private traceProvider: TracerProvider,
    private loggerProvider: LoggerProvider,
    private log: Logger,
  ) {}

  getMeter(name: string): Meter {
    let meter = this.meters.get(name);
    if (!meter) {
      meter = this.meterProvider.getMeter(name, this.resource.attributes[ATTR_SERVICE_VERSION] as string);
      this.meters.set(name, meter);
    }
    return meter;
  }

  getTracer(name: string): Tracer {
    let tracer = this.tracers.get(name);
    if (!tracer) {
      tracer = this.traceProvider.getTracer(name, this.resource.attributes[ATTR_SERVICE_VERSION] as string);
      this.tracers.set(name, tracer);
    }
    return tracer;
  }

  public start() {
    this.log.info('Starting OpenTelemetry client');
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

    // Add a callback to the logger to set context data from current trace
    // Adapted from open-telemetry/opentelemetry-js-contrib PinoInstrumentation._getMixinFunction
    addLogDataHandler((data: LogData) => {
      const spanContext = trace.getSpan(context.active())?.spanContext();
      return spanContext && isSpanContextValid(spanContext)
        ? {
            ...data,
            ['trace_id']: spanContext.traceId,
            ['span_id']: spanContext.spanId,
            ['trace_flags']: `0${spanContext.traceFlags.toString(16)}`,
          }
        : data;
    });

    this.hostMetrics = new HostMetrics({
      name: this.resource.attributes[ATTR_SERVICE_NAME] as string,
      meterProvider: this.meterProvider,
    });

    // See these two links for more information on providing target information:
    // https://opentelemetry.io/docs/specs/otel/compatibility/prometheus_and_openmetrics/#resource-attributes
    // https://github.com/OpenObservability/OpenMetrics/blob/main/specification/OpenMetrics.md#supporting-target-metadata-in-both-push-based-and-pull-based-systems
    this.targetInfo = this.meterProvider.getMeter('target').createGauge('target_info', {
      description: 'Target metadata',
    });

    this.targetInfo.record(1, this.resource.attributes);
    this.hostMetrics.start();
  }

  public isEnabled() {
    return true;
  }

  public async flush() {
    await Promise.all([
      this.meterProvider.forceFlush(),
      this.loggerProvider.forceFlush(),
      this.traceProvider instanceof NodeTracerProvider ? this.traceProvider.forceFlush() : Promise.resolve(),
    ]);
  }

  public async stop() {
    const flushAndShutdown = async (provider: { forceFlush: () => Promise<void>; shutdown: () => Promise<void> }) => {
      await provider.forceFlush();
      await provider.shutdown();
    };

    await Promise.all([
      flushAndShutdown(this.meterProvider),
      flushAndShutdown(this.loggerProvider),
      this.traceProvider instanceof NodeTracerProvider ? flushAndShutdown(this.traceProvider) : Promise.resolve(),
    ]);
  }

  public static async createAndStart(config: TelemetryClientConfig, log: Logger): Promise<OpenTelemetryClient> {
    const resource = await getOtelResource();

    // TODO(palla/log): Should we show traces as logs in stdout when otel collection is disabled?
    const tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: config.tracesCollectorUrl
        ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: config.tracesCollectorUrl.href }))]
        : [],
    });

    tracerProvider.register();

    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: config.metricsCollectorUrl!.href,
          }),
          exportIntervalMillis: config.otelCollectIntervalMs,
          exportTimeoutMillis: config.otelExportTimeoutMs,
        }),
      ],
      views: [
        // Every histogram matching the selector (type + unit) gets these custom buckets assigned
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'ms',
          aggregation: new ExplicitBucketHistogramAggregation(
            // 181 buckets between 5ms and 1hr
            [
              ...linearBuckets(5, 100, 20), // 20 buckets between 5 and 100ms
              ...linearBuckets(100, 1_000, 20).slice(1), // another 20 buckets between 100ms and 1s. slice(1) to remove duplicate 100
              ...linearBuckets(1_000, 10_000, 20).slice(1),
              ...linearBuckets(10_000, 60_000, 20).slice(1),
              ...linearBuckets(60_000, 300_000, 20).slice(1),
              ...linearBuckets(300_000, 600_000, 20).slice(1),
              ...linearBuckets(600_000, 1_200_000, 20).slice(1),
              ...linearBuckets(1_200_000, 1_800_000, 20).slice(1),
              ...linearBuckets(1_800_000, 3_600_000, 20).slice(1), // 1hr
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'By',
          aggregation: new ExplicitBucketHistogramAggregation(
            // 143 buckets between 32 bytes and 2MB
            [
              ...linearBuckets(2 ** 5, 2 ** 10, 31), // 32 bytes to 1KB at a resolution of 32 bytes
              ...linearBuckets(2 ** 10, 2 ** 15, 31).slice(1), // 1KB to 32KB at a resolution of 1KB
              ...linearBuckets(2 ** 15, 2 ** 18, 32).slice(1), // 32KB to 256KB at a resolution of 7KB
              ...linearBuckets(2 ** 18, 2 ** 20, 32).slice(1), // 256KB to 1MB at a resolution of 24KB
              ...linearBuckets(2 ** 20, 2 ** 21, 16).slice(1), // 1MB to 2MB at a resolution of 64KB
            ],
            true,
          ),
        }),
      ],
    });

    const loggerProvider = await registerOtelLoggerProvider(resource, config.logsCollectorUrl);

    const service = new OpenTelemetryClient(resource, meterProvider, tracerProvider, loggerProvider, log);
    service.start();

    return service;
  }
}
