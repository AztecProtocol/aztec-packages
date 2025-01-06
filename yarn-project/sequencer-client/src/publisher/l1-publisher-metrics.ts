import type { L1PublishBlockStats, L1PublishProofStats, L1PublishStats } from '@aztec/circuit-types/stats';
import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { formatEther } from 'viem/utils';

export type L1TxType = 'submitProof' | 'process' | 'claimEpochProofRight';

export class L1PublisherMetrics {
  private gasPrice: Histogram;

  private txCount: UpDownCounter;
  private txDuration: Histogram;
  private txGas: Histogram;
  private txCalldataSize: Histogram;
  private txCalldataGas: Histogram;
  private txBlobDataGasUsed: Histogram;
  private txBlobDataGasCost: Histogram;

  constructor(client: TelemetryClient, name = 'L1Publisher') {
    const meter = client.getMeter(name);

    this.gasPrice = meter.createHistogram(Metrics.L1_PUBLISHER_GAS_PRICE, {
      description: 'The gas price used for transactions',
      unit: 'gwei',
      valueType: ValueType.DOUBLE,
    });

    this.txCount = meter.createUpDownCounter(Metrics.L1_PUBLISHER_TX_COUNT, {
      description: 'The number of transactions processed',
    });

    this.txDuration = meter.createHistogram(Metrics.L1_PUBLISHER_TX_DURATION, {
      description: 'The duration of transaction processing',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.txGas = meter.createHistogram(Metrics.L1_PUBLISHER_TX_GAS, {
      description: 'The gas consumed by transactions',
      unit: 'gas',
      valueType: ValueType.INT,
    });

    this.txCalldataSize = meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_SIZE, {
      description: 'The size of the calldata in transactions',
      unit: 'By',
      valueType: ValueType.INT,
    });

    this.txCalldataGas = meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_GAS, {
      description: 'The gas consumed by the calldata in transactions',
      unit: 'gas',
      valueType: ValueType.INT,
    });

    this.txBlobDataGasUsed = meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_USED, {
      description: 'The amount of blob gas used in transactions',
      unit: 'gas',
      valueType: ValueType.INT,
    });

    this.txBlobDataGasCost = meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_COST, {
      description: 'The gas cost of blobs in transactions',
      unit: 'gwei',
      valueType: ValueType.INT,
    });
  }

  recordFailedTx(txType: L1TxType) {
    this.txCount.add(1, {
      [Attributes.L1_TX_TYPE]: txType,
      [Attributes.OK]: false,
    });
  }

  recordSubmitProof(durationMs: number, stats: L1PublishProofStats) {
    this.recordTx('submitProof', durationMs, stats);
  }

  recordProcessBlockTx(durationMs: number, stats: L1PublishBlockStats) {
    this.recordTx('process', durationMs, stats);
  }

  recordClaimEpochProofRightTx(durationMs: number, stats: L1PublishStats) {
    this.recordTx('claimEpochProofRight', durationMs, stats);
  }

  private recordTx(txType: L1TxType, durationMs: number, stats: L1PublishStats) {
    const attributes = {
      [Attributes.L1_TX_TYPE]: txType,
      [Attributes.L1_SENDER]: stats.sender,
    } as const;

    this.txCount.add(1, {
      ...attributes,
      [Attributes.OK]: true,
    });

    this.txDuration.record(Math.ceil(durationMs), attributes);
    this.txGas.record(
      // safe to downcast - total block limit is 30M gas which fits in a JS number
      Number(stats.gasUsed),
      attributes,
    );
    this.txCalldataGas.record(stats.calldataGas, attributes);
    this.txCalldataSize.record(stats.calldataSize, attributes);

    this.txBlobDataGasCost.record(Number(stats.blobDataGas), attributes);
    this.txBlobDataGasUsed.record(Number(stats.blobGasUsed), attributes);

    try {
      this.gasPrice.record(parseInt(formatEther(stats.gasPrice, 'gwei'), 10));
    } catch (e) {
      // ignore
    }
  }
}
