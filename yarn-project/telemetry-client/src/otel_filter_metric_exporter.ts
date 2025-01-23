import { type ExportResult } from '@opentelemetry/core';
import { type MetricData, type PushMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics';

export class OtelFilterMetricExporter implements PushMetricExporter {
  constructor(private readonly exporter: PushMetricExporter, private readonly excludeMetricPrefixes: string[]) {
    if (exporter.selectAggregation) {
      (this as PushMetricExporter).selectAggregation = exporter.selectAggregation.bind(exporter);
    }
    if (exporter.selectAggregationTemporality) {
      (this as PushMetricExporter).selectAggregationTemporality = exporter.selectAggregationTemporality.bind(exporter);
    }
  }

  public export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
    const filteredMetrics: ResourceMetrics = {
      resource: metrics.resource,
      scopeMetrics: metrics.scopeMetrics
        .map(({ scope, metrics }) => ({ scope, metrics: this.filterMetrics(metrics) }))
        .filter(({ metrics }) => metrics.length > 0),
    };

    this.exporter.export(filteredMetrics, resultCallback);
  }

  private filterMetrics(metrics: MetricData[]): MetricData[] {
    return metrics.filter(
      metric => !this.excludeMetricPrefixes.some(prefix => metric.descriptor.name.startsWith(prefix)),
    );
  }

  public forceFlush(): Promise<void> {
    return this.exporter.forceFlush();
  }

  public shutdown(): Promise<void> {
    return this.exporter.shutdown();
  }
}
