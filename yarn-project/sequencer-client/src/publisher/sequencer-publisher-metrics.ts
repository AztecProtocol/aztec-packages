import { createLogger } from '@aztec/aztec.js/log';
import type { L1PublishCheckpointStats, L1PublishStats } from '@aztec/stdlib/stats';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

import { formatEther } from 'viem/utils';

export type L1TxType = 'process';

export class SequencerPublisherMetrics {
  private gasPrice: Histogram;

  private txCount: UpDownCounter;
  private txDuration: Histogram;
  private txGas: Histogram;
  private txCalldataSize: Histogram;
  private txCalldataGas: Histogram;
  private txBlobDataGasUsed: Histogram;
  private txBlobDataGasCost: Histogram;
  private txTotalFee: Histogram;

  private readonly blobCountHistogram: Histogram;
  private readonly blobInclusionBlocksHistogram: Histogram;
  private readonly blobTxSuccessCounter: UpDownCounter;
  private readonly blobTxFailureCounter: UpDownCounter;

  private senderBalance: Gauge;

  constructor(
    client: TelemetryClient,
    name = 'SequencerPublisher',
    private logger = createLogger('sequencer:publisher:metrics'),
  ) {
    const meter = client.getMeter(name);

    this.gasPrice = meter.createHistogram(Metrics.L1_PUBLISHER_GAS_PRICE);

    this.txCount = meter.createUpDownCounter(Metrics.L1_PUBLISHER_TX_COUNT);

    this.txDuration = meter.createHistogram(Metrics.L1_PUBLISHER_TX_DURATION);

    this.txGas = meter.createHistogram(Metrics.L1_PUBLISHER_TX_GAS);

    this.txCalldataSize = meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_SIZE);

    this.txCalldataGas = meter.createHistogram(Metrics.L1_PUBLISHER_TX_CALLDATA_GAS);

    this.txBlobDataGasUsed = meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_USED);

    this.txBlobDataGasCost = meter.createHistogram(Metrics.L1_PUBLISHER_TX_BLOBDATA_GAS_COST);

    this.blobCountHistogram = meter.createHistogram(Metrics.L1_PUBLISHER_BLOB_COUNT);

    this.blobInclusionBlocksHistogram = meter.createHistogram(Metrics.L1_PUBLISHER_BLOB_INCLUSION_BLOCKS);

    this.blobTxSuccessCounter = meter.createUpDownCounter(Metrics.L1_PUBLISHER_BLOB_TX_SUCCESS);

    this.blobTxFailureCounter = meter.createUpDownCounter(Metrics.L1_PUBLISHER_BLOB_TX_FAILURE);

    this.txTotalFee = meter.createHistogram(Metrics.L1_PUBLISHER_TX_TOTAL_FEE);

    this.senderBalance = meter.createGauge(Metrics.L1_PUBLISHER_BALANCE);
  }

  recordFailedTx(txType: L1TxType) {
    this.txCount.add(1, {
      [Attributes.L1_TX_TYPE]: txType,
      [Attributes.OK]: false,
    });

    if (txType === 'process') {
      this.blobTxFailureCounter.add(1);
    }
  }

  recordProcessBlockTx(durationMs: number, stats: L1PublishCheckpointStats) {
    this.recordTx('process', durationMs, stats);

    if (stats.blobCount && stats.blobCount > 0) {
      this.blobCountHistogram.record(stats.blobCount);

      if (stats.inclusionBlocks !== undefined) {
        this.blobInclusionBlocksHistogram.record(stats.inclusionBlocks);
      }

      this.blobTxSuccessCounter.add(1);
    }
  }

  recordSenderBalance(wei: bigint, senderAddress: string) {
    const eth = parseFloat(formatEther(wei, 'wei'));
    this.senderBalance.record(eth, {
      [Attributes.SENDER_ADDRESS]: senderAddress,
    });
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
    } catch {
      // ignore
    }

    const executionFee = stats.gasUsed * stats.gasPrice;
    const blobFee = stats.blobGasUsed * stats.blobDataGas;
    const totalFee = executionFee + blobFee;

    try {
      this.txTotalFee.record(parseFloat(formatEther(totalFee)));
    } catch {
      // ignore
    }
  }
}
