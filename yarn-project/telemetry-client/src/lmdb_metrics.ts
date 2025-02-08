import { DB_MAP_SIZE, DB_NUM_ITEMS, DB_USED_SIZE } from './metrics.js';
import {
  type Attributes,
  type BatchObservableResult,
  type Meter,
  type ObservableGauge,
  ValueType,
} from './telemetry.js';

export type LmdbStatsCallback = () => Promise<{ mappingSize: number; numItems: number; actualSize: number }>;

export class LmdbMetrics {
  private dbMapSize: ObservableGauge;
  private dbUsedSize: ObservableGauge;
  private dbNumItems: ObservableGauge;

  constructor(meter: Meter, private attributes?: Attributes, private getStats?: LmdbStatsCallback) {
    this.dbMapSize = meter.createObservableGauge(DB_MAP_SIZE, {
      description: 'LMDB Map Size',
      valueType: ValueType.INT,
      unit: 'By',
    });
    this.dbUsedSize = meter.createObservableGauge(DB_USED_SIZE, {
      description: 'LMDB Used Size',
      valueType: ValueType.INT,
      unit: 'By',
    });
    this.dbNumItems = meter.createObservableGauge(DB_NUM_ITEMS, {
      description: 'LMDB Num Items',
      valueType: ValueType.INT,
    });

    meter.addBatchObservableCallback(this.recordDBMetrics, [this.dbMapSize, this.dbUsedSize, this.dbNumItems]);
  }

  private recordDBMetrics = async (observable: BatchObservableResult) => {
    if (!this.getStats) {
      return;
    }
    const metrics = await this.getStats();
    observable.observe(this.dbMapSize, metrics.mappingSize, this.attributes);
    observable.observe(this.dbNumItems, metrics.numItems, this.attributes);
    observable.observe(this.dbUsedSize, metrics.actualSize, this.attributes);
  };
}
