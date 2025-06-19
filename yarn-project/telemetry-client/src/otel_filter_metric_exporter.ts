import type { ExportResult } from '@opentelemetry/core';
import type { MetricData, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';

export class OtelFilterMetricExporter implements PushMetricExporter {
  constructor(
    private readonly exporter: PushMetricExporter,
    private metricPrefix: string[],
    private readonly filter: 'allow' | 'deny' = 'deny',
  ) {
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
    return metrics.filter(metric => {
      const matched = this.metricPrefix.some(prefix => metric.descriptor.name.startsWith(prefix));

      if (this.filter === 'deny') {
        return !matched;
      }

      if (this.filter === 'allow') {
        return matched;
      }
    });
  }

  public forceFlush(): Promise<void> {
    return this.exporter.forceFlush();
  }

  public shutdown(): Promise<void> {
    return this.exporter.shutdown();
  }

  public setMetricPrefixes(metrics: string[]) {
    this.metricPrefix = metrics;
  }
}
