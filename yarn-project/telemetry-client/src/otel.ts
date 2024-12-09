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
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { type TelemetryClientConfig } from './config.js';
import { registerOtelLoggerProvider } from './otel_logger_provider.js';
import { getOtelResource } from './otel_resource.js';
import { type Gauge, type TelemetryClient } from './telemetry.js';

export class OpenTelemetryClient implements TelemetryClient {
  hostMetrics: HostMetrics | undefined;
  targetInfo: Gauge | undefined;

  protected constructor(
    private resource: IResource,
    private meterProvider: MeterProvider,
    private traceProvider: TracerProvider,
    private loggerProvider: LoggerProvider,
    private log: Logger,
  ) {}

  getMeter(name: string): Meter {
    return this.meterProvider.getMeter(name, this.resource.attributes[ATTR_SERVICE_VERSION] as string);
  }

  getTracer(name: string): Tracer {
    return this.traceProvider.getTracer(name, this.resource.attributes[ATTR_SERVICE_VERSION] as string);
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
    });

    const loggerProvider = await registerOtelLoggerProvider(resource, config.logsCollectorUrl);

    const service = new OpenTelemetryClient(resource, meterProvider, tracerProvider, loggerProvider, log);
    service.start();

    return service;
  }
}
