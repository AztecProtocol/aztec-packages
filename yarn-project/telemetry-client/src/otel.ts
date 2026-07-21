import { type LogData, type Logger, addLogDataHandler } from '@aztec/foundation/log';

import {
  type Context,
  DiagConsoleLogger,
  DiagLogLevel,
  type Meter as OtelMeter,
  ROOT_CONTEXT,
  type Tracer,
  type TracerProvider,
  context,
  diag,
  isSpanContextValid,
  propagation,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
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
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import type { TelemetryClientConfig } from './config.js';
import { toMetricOptions } from './metric-utils.js';
import type { MetricDefinition } from './metrics.js';
import { MonitoredBatchSpanProcessor } from './monitored_batch_span_processor.js';
import { NodejsMetricsMonitor } from './nodejs_metrics_monitor.js';
import { OtelFilterMetricExporter, PublicOtelFilterMetricExporter } from './otel_filter_metric_exporter.js';
import { registerOtelLoggerProvider } from './otel_logger_provider.js';
import { getOtelResource } from './otel_resource.js';
import type {
  Gauge,
  Histogram,
  Meter,
  ObservableGauge,
  ObservableUpDownCounter,
  TelemetryClient,
  UpDownCounter,
} from './telemetry.js';

/** Wraps an OpenTelemetry Meter to implement our custom Meter interface */
class WrappedMeter implements Meter {
  constructor(private otelMeter: OtelMeter) {}

  createGauge(metric: MetricDefinition): Gauge {
    return this.otelMeter.createGauge(metric.name, toMetricOptions(metric));
  }

  createObservableGauge(metric: MetricDefinition): ObservableGauge {
    return this.otelMeter.createObservableGauge(metric.name, toMetricOptions(metric));
  }

  createHistogram(metric: MetricDefinition, extraOptions?: Parameters<Meter['createHistogram']>[1]): Histogram {
    return this.otelMeter.createHistogram(metric.name, { ...toMetricOptions(metric), ...extraOptions });
  }

  createUpDownCounter(metric: MetricDefinition): UpDownCounter {
    return this.otelMeter.createUpDownCounter(metric.name, toMetricOptions(metric));
  }

  createObservableUpDownCounter(metric: MetricDefinition): ObservableUpDownCounter {
    return this.otelMeter.createObservableUpDownCounter(metric.name, toMetricOptions(metric));
  }

  addBatchObservableCallback(
    callback: Parameters<Meter['addBatchObservableCallback']>[0],
    observables: Parameters<Meter['addBatchObservableCallback']>[1],
  ): void {
    this.otelMeter.addBatchObservableCallback(callback, observables);
  }

  removeBatchObservableCallback(
    callback: Parameters<Meter['removeBatchObservableCallback']>[0],
    observables: Parameters<Meter['removeBatchObservableCallback']>[1],
  ): void {
    this.otelMeter.removeBatchObservableCallback(callback, observables);
  }
}

export type OpenTelemetryClientFactory = (resource: IResource, log: Logger) => OpenTelemetryClient;

export class OpenTelemetryClient implements TelemetryClient {
  hostMetrics: HostMetrics | undefined;
  nodejsMetricsMonitor: NodejsMetricsMonitor | undefined;
  private meters: Map<string, WrappedMeter> = new Map<string, WrappedMeter>();
  private tracers: Map<string, Tracer> = new Map<string, Tracer>();

  /** Memoized shutdown promise. The telemetry client is shared between the aztec-node and an embedded prover-node,
   * so stop() can be invoked more than once; the providers throw "shutdown may only be called once" and
   * "invalid attempt to force flush after shutdown" if that happens. Guarding here makes stop()/flush() idempotent. */
  private stopPromise: Promise<void> | undefined;

  protected constructor(
    private resource: IResource,
    private meterProvider: MeterProvider,
    private traceProvider: TracerProvider,
    private loggerProvider: LoggerProvider | undefined,
    private publicMetricExporter: PublicOtelFilterMetricExporter | undefined,
    private log: Logger,
  ) {}

  setExportedPublicTelemetry(metrics: string[]): void {
    this.publicMetricExporter?.setMetricPrefixes(metrics);
  }

  setPublicTelemetryCollectFrom(roles: string[]): void {
    this.publicMetricExporter?.setAllowedRoles(roles);
  }

  getMeter(name: string): Meter {
    let meter = this.meters.get(name);
    if (!meter) {
      const otelMeter = this.meterProvider.getMeter(name, this.resource.attributes[ATTR_SERVICE_VERSION] as string);
      meter = new WrappedMeter(otelMeter);
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

    const nodejsMeter = new WrappedMeter(
      this.meterProvider.getMeter(this.resource.attributes[ATTR_SERVICE_NAME] as string),
    );
    this.nodejsMetricsMonitor = new NodejsMetricsMonitor(nodejsMeter);

    this.hostMetrics.start();
    this.nodejsMetricsMonitor.start();
  }

  public isEnabled() {
    return true;
  }

  public async flush() {
    // Flushing after the providers have been shut down throws "invalid attempt to force flush after shutdown".
    if (this.stopPromise) {
      return;
    }
    await Promise.all([
      this.meterProvider.forceFlush(),
      this.loggerProvider?.forceFlush(),
      this.traceProvider instanceof NodeTracerProvider ? this.traceProvider.forceFlush() : Promise.resolve(),
    ]);
  }

  public stop() {
    return (this.stopPromise ??= this.doStop());
  }

  private async doStop() {
    this.nodejsMetricsMonitor?.stop();

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

  public getTraceContext(): string | undefined {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return carrier['traceparent'];
  }

  public extractPropagatedContext(traceContext: string): Context {
    const extractedContext = propagation.extract(ROOT_CONTEXT, {
      traceparent: traceContext,
    });
    return extractedContext;
  }

  public static createMeterProvider(
    resource: IResource,
    exporters: Array<PeriodicExportingMetricReaderOptions>,
  ): MeterProvider {
    return new MeterProvider({
      resource,
      readers: exporters.map(options => new PeriodicExportingMetricReader(options)),

      views: [
        // Every histogram matching the selector (type + unit) gets these custom buckets assigned
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'Mmana',
          aggregation: new ExplicitBucketHistogramAggregation(
            [0.1, 0.5, 1, 2, 4, 8, 10, 25, 50, 100, 500, 1000, 5000, 10000],
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'tx',
          aggregation: new ExplicitBucketHistogramAggregation(
            // TPS
            [0.1 * 36, 0.2 * 36, 0.5 * 36, 1 * 36, 2 * 36, 5 * 36, 10 * 36, 15 * 36].map(Math.ceil),
            true,
          ),
        }),
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 's',
          aggregation: new ExplicitBucketHistogramAggregation(
            [1, 2, 4, 6, 10, 15, 30, 60, 90, 120, 180, 240, 300, 480, 600, 900, 1200],
            true,
          ),
        }),
        // Pending-to-mined delay routinely exceeds the 1-minute ceiling of the generic `ms`
        // view below under load, so it would saturate at 60s. Give this one metric wider
        // buckets (1s to 10min). This must precede the generic `ms` view: when multiple views
        // match an instrument, the SDK keeps the first-registered compatible storage, so the
        // first view in this list wins the bucket boundaries.
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentName: 'aztec.mempool.tx_mined_delay',
          instrumentUnit: 'ms',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 30_000, 45_000, 60_000, 90_000, 120_000, 180_000, 300_000,
              600_000,
            ],
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
        // L1 gas prices in gwei: priority fees ~0.01-10, base fees ~1-500, spikes to 1000+
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'gwei',
          aggregation: new ExplicitBucketHistogramAggregation(
            [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000],
            true,
          ),
        }),
        // L1 gas consumption: tx gas 100k-30M, calldata/blob gas varies
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'gas',
          aggregation: new ExplicitBucketHistogramAggregation(
            [
              10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 15_000_000,
              30_000_000,
            ],
            true,
          ),
        }),
        // L1 tx total fee in ETH: typically 0.001 - 1 ETH
        new View({
          instrumentType: InstrumentType.HISTOGRAM,
          instrumentUnit: 'eth',
          aggregation: new ExplicitBucketHistogramAggregation(
            [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
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
          ? [
              new MonitoredBatchSpanProcessor(new OTLPTraceExporter({ url: config.tracesCollectorUrl.href }), log, {
                maxQueueSize: config.otelBspMaxQueueSize,
                minTraceDurationMs: config.otelMinTraceDurationMs,
              }),
            ]
          : [],
      });

      tracerProvider.register({
        propagator: new W3CTraceContextPropagator(),
      });

      const exporters: PeriodicExportingMetricReaderOptions[] = [];
      if (config.metricsCollectorUrl) {
        // Default to a blacklist that is empty (allow all metrics)
        let filter: string[] = [];
        let mode: 'allow' | 'deny' = 'deny';
        if (config.otelExcludeMetrics.length > 0) {
          // Implement a blacklist as specified in config
          log.info(`Excluding metrics from export: ${config.otelExcludeMetrics}`);
          filter = config.otelExcludeMetrics;
          mode = 'deny';
        } else if (config.otelIncludeMetrics.length > 0) {
          // Implement a whitelist as specified in config
          log.info(`Including only specified metrics for export: ${config.otelIncludeMetrics}`);
          filter = config.otelIncludeMetrics;
          mode = 'allow';
        }
        exporters.push({
          exporter: new OtelFilterMetricExporter(
            new OTLPMetricExporter({ url: config.metricsCollectorUrl.href }),
            filter,
            mode,
          ),
          exportTimeoutMillis: config.otelExportTimeoutMs,
          exportIntervalMillis: config.otelCollectIntervalMs,
        });
      }

      let publicExporter: PublicOtelFilterMetricExporter | undefined;
      if (config.publicMetricsCollectorUrl && !config.publicMetricsOptOut) {
        log.info(`Exporting public metrics: ${config.publicIncludeMetrics}`, {
          publicMetrics: config.publicIncludeMetrics,
          collectorUrl: config.publicMetricsCollectorUrl,
        });
        publicExporter = new PublicOtelFilterMetricExporter(
          config.publicMetricsCollectFrom,
          new OTLPMetricExporter({ url: config.publicMetricsCollectorUrl.href }),
          config.publicIncludeMetrics,
        );
        exporters.push({
          exporter: publicExporter,
          exportTimeoutMillis: config.otelExportTimeoutMs,
          exportIntervalMillis: config.otelCollectIntervalMs,
        });
      }

      const meterProvider = OpenTelemetryClient.createMeterProvider(resource, exporters);
      const loggerProvider = registerOtelLoggerProvider(resource, config.logsCollectorUrl);

      return new OpenTelemetryClient(resource, meterProvider, tracerProvider, loggerProvider, publicExporter, log);
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
