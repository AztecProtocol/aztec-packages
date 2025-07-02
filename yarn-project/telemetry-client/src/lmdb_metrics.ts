import * as Metrics from './metrics.js';
import {
  type AttributesType,
  type BatchObservableResult,
  type Meter,
  type ObservableGauge,
  ValueType,
} from './telemetry.js';

export type LmdbStatsCallback = () => Promise<{
  mappingSize: number;
  physicalFileSize: number;
  numItems: number;
  actualSize: number;
}>;

export class LmdbMetrics {
  private dbMapSize: ObservableGauge;
  private dbPhysicalFileSize: ObservableGauge;
  private dbUsedSize: ObservableGauge;
  private dbNumItems: ObservableGauge;

  constructor(
    meter: Meter,
    private attributes?: AttributesType,
    private getStats?: LmdbStatsCallback,
  ) {
    this.dbMapSize = meter.createObservableGauge(Metrics.DB_MAP_SIZE, {
      description: 'LMDB Map Size',
      valueType: ValueType.INT,
      unit: 'By',
    });
    this.dbPhysicalFileSize = meter.createObservableGauge(Metrics.DB_PHYSICAL_FILE_SIZE, {
      description: 'LMDB Physical File Size',
      valueType: ValueType.INT,
      unit: 'By',
    });
    this.dbUsedSize = meter.createObservableGauge(Metrics.DB_USED_SIZE, {
      description: 'LMDB Used Size',
      valueType: ValueType.INT,
      unit: 'By',
    });
    this.dbNumItems = meter.createObservableGauge(Metrics.DB_NUM_ITEMS, {
      description: 'LMDB Num Items',
      valueType: ValueType.INT,
    });

    meter.addBatchObservableCallback(this.recordDBMetrics, [
      this.dbMapSize,
      this.dbPhysicalFileSize,
      this.dbUsedSize,
      this.dbNumItems,
    ]);
  }

  private recordDBMetrics = async (observable: BatchObservableResult) => {
    if (!this.getStats) {
      return;
    }
    const metrics = await this.getStats();
    observable.observe(this.dbMapSize, metrics.mappingSize, this.attributes);
    observable.observe(this.dbPhysicalFileSize, metrics.physicalFileSize, this.attributes);
    observable.observe(this.dbNumItems, metrics.numItems, this.attributes);
    observable.observe(this.dbUsedSize, metrics.actualSize, this.attributes);
  };
}
