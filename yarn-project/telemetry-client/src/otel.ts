import { type Meter, type Tracer } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { Resource } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider, type SpanExporter } from '@opentelemetry/sdk-trace-node';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { type TelemetryClient } from './telemetry.js';

export class OpenTelemetryClient implements TelemetryClient {
  private hostMetrics: HostMetrics | undefined;
  private tracerProvider: NodeTracerProvider;
  private meterProvider: MeterProvider;

  constructor(
    protected resource: Resource,
    metricExporter: PushMetricExporter,
    spanExporter: SpanExporter,
    private reportHostMetrics = true,
  ) {
    this.tracerProvider = new NodeTracerProvider({
      resource,
    });
    this.tracerProvider.addSpanProcessor(new BatchSpanProcessor(spanExporter));

    this.meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
        }),
      ],
    });
  }

  getMeter(name: string): Meter {
    return this.meterProvider.getMeter(name, this.resource.attributes[SEMRESATTRS_SERVICE_VERSION] as string);
  }

  getTracer(name: string): Tracer {
    return this.tracerProvider.getTracer(name, this.resource.attributes[SEMRESATTRS_SERVICE_VERSION] as string);
  }

  public start() {
    this.tracerProvider.register();

    if (this.reportHostMetrics) {
      this.hostMetrics = new HostMetrics({
        name: this.resource.attributes[SEMRESATTRS_SERVICE_NAME] as string,
        meterProvider: this.meterProvider,
      });

      this.hostMetrics.start();
    }
  }

  public async stop() {
    await Promise.all([this.meterProvider.shutdown(), this.tracerProvider.shutdown()]);
  }

  public static createAndStart(name: string, version: string, collectorBaseUrl: URL): OpenTelemetryClient {
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: name,
      [SEMRESATTRS_SERVICE_VERSION]: version,
    });

    const client = new OpenTelemetryClient(
      resource,
      new OTLPMetricExporter({ url: new URL('/v1/metrics', collectorBaseUrl).href }),
      new OTLPTraceExporter({ url: new URL('/v1/traces', collectorBaseUrl).href }),
    );

    client.start();
    return client;
  }
}
