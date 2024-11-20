import { type Gauge, type Meter, type Metrics, ValueType } from './telemetry.js';

export type LmdbMetricDescriptor = {
  name: Metrics;
  description: string;
};

export class LmdbMetrics {
  private dbMapSize: Gauge;
  private dbUsedSize: Gauge;
  private dbNumItems: Gauge;

  constructor(
    meter: Meter,
    dbMapSizeDescriptor: LmdbMetricDescriptor,
    dbUsedSizeDescriptor: LmdbMetricDescriptor,
    dbNumItemsDescriptor: LmdbMetricDescriptor,
  ) {
    this.dbMapSize = meter.createGauge(dbMapSizeDescriptor.name, {
      description: dbMapSizeDescriptor.description,
      valueType: ValueType.INT,
    });
    this.dbUsedSize = meter.createGauge(dbUsedSizeDescriptor.name, {
      description: dbUsedSizeDescriptor.description,
      valueType: ValueType.INT,
    });
    this.dbNumItems = meter.createGauge(dbNumItemsDescriptor.name, {
      description: dbNumItemsDescriptor.description,
      valueType: ValueType.INT,
    });
  }

  public recordDBMetrics(metrics: { mappingSize: number; numItems: number; actualSize: number }) {
    this.dbMapSize.record(metrics.mappingSize);
    this.dbNumItems.record(metrics.actualSize);
    this.dbUsedSize.record(metrics.actualSize);
  }
}
