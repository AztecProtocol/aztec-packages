import { type BatchObservableResult, type Meter, type Metrics, type ObservableGauge, ValueType } from './telemetry.js';

export type LmdbMetricDescriptor = {
  name: Metrics;
  description: string;
};

export type LmdbStatsCallback = () => { mappingSize: number; numItems: number; actualSize: number };

export class LmdbMetrics {
  private dbMapSize: ObservableGauge;
  private dbUsedSize: ObservableGauge;
  private dbNumItems: ObservableGauge;

  constructor(
    meter: Meter,
    dbMapSizeDescriptor: LmdbMetricDescriptor,
    dbUsedSizeDescriptor: LmdbMetricDescriptor,
    dbNumItemsDescriptor: LmdbMetricDescriptor,
    private getStats?: LmdbStatsCallback,
  ) {
    this.dbMapSize = meter.createObservableGauge(dbMapSizeDescriptor.name, {
      description: dbMapSizeDescriptor.description,
      valueType: ValueType.INT,
    });
    this.dbUsedSize = meter.createObservableGauge(dbUsedSizeDescriptor.name, {
      description: dbUsedSizeDescriptor.description,
      valueType: ValueType.INT,
    });
    this.dbNumItems = meter.createObservableGauge(dbNumItemsDescriptor.name, {
      description: dbNumItemsDescriptor.description,
      valueType: ValueType.INT,
    });

    meter.addBatchObservableCallback(this.recordDBMetrics, [this.dbMapSize, this.dbUsedSize, this.dbNumItems]);
  }

  private recordDBMetrics = (observable: BatchObservableResult) => {
    if (!this.getStats) {
      return;
    }
    const metrics = this.getStats();
    observable.observe(this.dbMapSize, metrics.mappingSize);
    observable.observe(this.dbNumItems, metrics.numItems);
    observable.observe(this.dbUsedSize, metrics.actualSize);
  };
}
