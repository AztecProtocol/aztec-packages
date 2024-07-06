import { Resource } from '@opentelemetry/resources';
import { AggregationTemporality, InMemoryMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-node';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { OpenTelemetryClient } from './otel.js';

export class InMemoryTelemetryClient extends OpenTelemetryClient {
  private constructor(
    resource: Resource,
    private metricExporter: InMemoryMetricExporter,
    private spanExporter: InMemorySpanExporter,
  ) {
    super(resource, metricExporter, spanExporter, false);
  }

  getMetrics(): ResourceMetrics[] {
    return this.metricExporter.getMetrics();
  }

  getFinishedSpans(): ReadableSpan[] {
    return this.spanExporter.getFinishedSpans();
  }

  reset() {
    this.metricExporter.reset();
    this.spanExporter.reset();
  }

  public static override createAndStart(name: string, version: string): InMemoryTelemetryClient {
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: name,
      [SEMRESATTRS_SERVICE_VERSION]: version,
    });

    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
    const spanExporter = new InMemorySpanExporter();

    const client = new InMemoryTelemetryClient(resource, metricExporter, spanExporter);
    client.start();

    return client;
  }
}
