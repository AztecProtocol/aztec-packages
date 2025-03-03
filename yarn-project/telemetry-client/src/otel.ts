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
import type { IResource } from '@opentelemetry/resources';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  ExplicitBucketHistogramAggregation,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type PeriodicExportingMetricReaderOptions,
  View,
} from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import type { TelemetryClientConfig } from './config.js';
import { EventLoopMonitor } from './event_loop_monitor.js';
import { OtelFilterMetricExporter } from './otel_filter_metric_exporter.js';
import { registerOtelLoggerProvider } from './otel_logger_provider.js';
import { getOtelResource } from './otel_resource.js';
import type { TelemetryClient } from './telemetry.js';

export type OpenTelemetryClientFactory = (resource: IResource, log: Logger) => OpenTelemetryClient;

export class OpenTelemetryClient implements TelemetryClient {
  hostMetrics: HostMetrics | undefined;
  eventLoopMonitor: EventLoopMonitor | undefined;
  private meters: Map<string, Meter> = new Map<string, Meter>();
  private tracers: Map<string, Tracer> = new Map<string, Tracer>();

  protected constructor(
    private resource: IResource,
    private meterProvider: MeterProvider,
    private traceProvider: TracerProvider,
    private loggerProvider: LoggerProvider | undefined,
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

    this.eventLoopMonitor = new EventLoopMonitor(
      this.meterProvider.getMeter(this.resource.attributes[ATTR_SERVICE_NAME] as string),
    );

    this.hostMetrics.start();
    this.eventLoopMonitor.start();
  }

  public isEnabled() {
    return true;
  }

  public async flush() {
    await Promise.all([
      this.meterProvider.forceFlush(),
      this.loggerProvider?.forceFlush(),
      this.traceProvider instanceof NodeTracerProvider ? this.traceProvider.forceFlush() : Promise.resolve(),
    ]);
  }

  public async stop() {
    this.eventLoopMonitor?.stop();

    const flushAndShutdown = async (provider?: { forceFlush: () => Promise<void>; shutdown: () => Promise<void> }) => {
      if (!provider) {
        return;
      }
      await provider.forceFlush();
      await provider.shutdown();
    };

    await Promise.all([
      flushAndShutdown(this.meterProvider),
      flushAndShutdown(this.loggerProvider),
      this.traceProvider instanceof NodeTracerProvider ? flushAndShutdown(this.traceProvider) : Promise.resolve(),
    ]);
  }

  public static createMeterProvider(
    resource: IResource,
    options: Partial<PeriodicExportingMetricReaderOptions>,
  ): MeterProvider {
    return new MeterProvider({
      resource,
      readers: options.exporter
        ? [new PeriodicExportingMetricReader(options as PeriodicExportingMetricReaderOptions)]
        : [],

      views: [
        // Every histogram matching the selector (type + unit) gets these custom buckets assigned
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 's',
          aggregation: new ExplicitBucketHistogramAggregation(
            [1, 2, 4, 6, 10, 15, 30, 60, 90, 120, 180, 240, 300, 480, 600],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'ms',
          aggregation: new ExplicitBucketHistogramAggregation(
            // 10ms to 1 minute
            [10, 20, 35, 50, 75, 100, 250, 500, 750, 1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 30_000, 60_000],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'us',
          aggregation: new ExplicitBucketHistogramAggregation(
            // 1us to 1s
            [
              5, 10, 25, 50, 75, 100, 250, 500, 750, 1_000, 2_500, 5_000, 7_500, 10_000, 25_000, 50_000, 100_000,
              250_000, 500_000, 1_000_000,
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'By',
          aggregation: new ExplicitBucketHistogramAggregation(
            // from 32 bytes to 2MB
            [
              32,
              64,
              128,
              256,
              512,
              1024, // 1kb
              2048,
              4096,
              8192,
              16384,
              32768,
              65536,
              131072,
              262144,
              524288,
              1048576, // 1mb
              1572864,
              2097152, // 2mb
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'gas/s',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_000_000, 4_000_000,
              8_000_000, 10_000_000, 15_000_000, 30_000_000,
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'mana/s',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_000_000, 4_000_000,
              8_000_000, 10_000_000, 15_000_000, 30_000_000,
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'gas/block',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_000_000, 4_000_000,
              8_000_000, 10_000_000, 15_000_000, 30_000_000,
            ],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'gas/tx',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000,
              10_000_000, 15_000_000, 30_000_000,
            ],
            true,
          ),
        }),
      ],
    });
  }

  private static getCustomClientFactory(config: TelemetryClientConfig): OpenTelemetryClientFactory {
    return (resource: IResource, log: Logger) => {
      const tracerProvider = new NodeTracerProvider({
        resource,
        spanProcessors: config.tracesCollectorUrl
          ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: config.tracesCollectorUrl.href }))]
          : [],
      });

      tracerProvider.register();

      const meterProvider = OpenTelemetryClient.createMeterProvider(resource, {
        exporter: config.metricsCollectorUrl
          ? new OtelFilterMetricExporter(
              new OTLPMetricExporter({ url: config.metricsCollectorUrl.href }),
              config.otelExcludeMetrics ?? [],
            )
          : undefined,
        exportTimeoutMillis: config.otelExportTimeoutMs,
        exportIntervalMillis: config.otelCollectIntervalMs,
      });

      const loggerProvider = registerOtelLoggerProvider(resource, config.logsCollectorUrl);

      return new OpenTelemetryClient(resource, meterProvider, tracerProvider, loggerProvider, log);
    };
  }

  public static createAndStart(config: TelemetryClientConfig, log: Logger): OpenTelemetryClient {
    const resource = getOtelResource();
    const factory = OpenTelemetryClient.getCustomClientFactory(config);

    const service = factory(resource, log);
    service.start();

    return service;
  }
}
