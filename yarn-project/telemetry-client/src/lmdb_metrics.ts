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

  public recordDBMetrics(dbMapSize: number, dbNumItems: number, dbUsedSize: number) {
    this.dbMapSize.record(dbMapSize);
    this.dbNumItems.record(dbNumItems);
    this.dbUsedSize.record(dbUsedSize);
  }
}
