import { type DebugLogger } from '@aztec/foundation/log';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  type Meter,
  type Tracer,
  type TracerProvider,
  diag,
} from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { awsEc2Detector, awsEcsDetector } from '@opentelemetry/resource-detector-aws';
import {
  type IResource,
  detectResourcesSync,
  envDetectorSync,
  osDetectorSync,
  processDetectorSync,
  serviceInstanceIdDetectorSync,
} from '@opentelemetry/resources';
import { type LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { aztecDetector } from './aztec_resource_detector.js';
import { type TelemetryClientConfig } from './config.js';
import { registerOtelLoggerProvider } from './otel_logger_provider.js';
import { type Gauge, type TelemetryClient } from './telemetry.js';

export class OpenTelemetryClient implements TelemetryClient {
  hostMetrics: HostMetrics | undefined;
  targetInfo: Gauge | undefined;

  protected constructor(
    private resource: IResource,
    private meterProvider: MeterProvider,
    private traceProvider: TracerProvider,
    private loggerProvider: LoggerProvider,
    private log: DebugLogger,
  ) {}

  getMeter(name: string): Meter {
    return this.meterProvider.getMeter(name, this.resource.attributes[SEMRESATTRS_SERVICE_VERSION] as string);
  }

  getTracer(name: string): Tracer {
    return this.traceProvider.getTracer(name, this.resource.attributes[SEMRESATTRS_SERVICE_VERSION] as string);
  }

  public start() {
    this.log.info('Starting OpenTelemetry client');
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

    this.hostMetrics = new HostMetrics({
      name: this.resource.attributes[SEMRESATTRS_SERVICE_NAME] as string,
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

  public static async createAndStart(config: TelemetryClientConfig, log: DebugLogger): Promise<OpenTelemetryClient> {
    const resource = detectResourcesSync({
      detectors: [
        osDetectorSync,
        envDetectorSync,
        processDetectorSync,
        serviceInstanceIdDetectorSync,
        awsEc2Detector,
        awsEcsDetector,
        aztecDetector,
      ],
    });

    if (resource.asyncAttributesPending) {
      await resource.waitForAsyncAttributes!();
    }

    const tracerProvider = new NodeTracerProvider({
      resource,
    });

    // optionally push traces to an OTEL collector instance
    if (config.tracesCollectorUrl) {
      tracerProvider.addSpanProcessor(
        new BatchSpanProcessor(new OTLPTraceExporter({ url: config.tracesCollectorUrl.href })),
      );
    }

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

    const loggerProvider = registerOtelLoggerProvider(resource, config.logsCollectorUrl);
    instrumentLogger(loggerProvider, tracerProvider, meterProvider);

    const service = new OpenTelemetryClient(resource, meterProvider, tracerProvider, loggerProvider, log);
    service.start();

    return service;
  }
}

function instrumentLogger(
  loggerProvider: LoggerProvider,
  tracerProvider: NodeTracerProvider,
  meterProvider: MeterProvider,
) {
  // We disable log sending since we have a batch log processor already configured
  const instrumentation = new PinoInstrumentation({ disableLogSending: true });
  instrumentation.setLoggerProvider(loggerProvider);
  instrumentation.setTracerProvider(tracerProvider);
  instrumentation.setMeterProvider(meterProvider);
  instrumentation.enable();
}
