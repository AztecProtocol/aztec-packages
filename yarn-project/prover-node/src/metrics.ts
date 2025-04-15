import { createLogger } from '@aztec/foundation/log';
import type { L1PublishProofStats, L1PublishStats } from '@aztec/stdlib/stats';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

import { formatEther } from 'viem';

export class ProverNodeMetrics {
  proverEpochExecutionDuration: Histogram;
  provingJobDuration: Histogram;
  provingJobBlocks: Gauge;
  provingJobTransactions: Gauge;

  gasPrice: Histogram;
  txCount: UpDownCounter;
  txDuration: Histogram;
  txGas: Histogram;
  txCalldataSize: Histogram;
  txCalldataGas: Histogram;
  txBlobDataGasUsed: Histogram;
  txBlobDataGasCost: Histogram;
  txTotalFee: Histogram;

  private senderBalance: Gauge;

  constructor(
    public readonly client: TelemetryClient,
    name = 'ProverNode',
    private logger = createLogger('prover-node:publisher:metrics'),
  ) {
    const meter = client.getMeter(name);
    this.proverEpochExecutionDuration = meter.createHistogram(Metrics.PROVER_NODE_EXECUTION_DURATION, {
      description: 'Duration of execution of an epoch by the prover',
      unit: 'ms',
      valueType: ValueType.INT,
    });
    this.provingJobDuration = meter.createHistogram(Metrics.PROVER_NODE_JOB_DURATION, {
      description: 'Duration of proving job',
      unit: 's',
      valueType: ValueType.DOUBLE,
    });
    this.provingJobBlocks = meter.createGauge(Metrics.PROVER_NODE_JOB_BLOCKS, {
      description: 'Number of blocks in a proven epoch',
      valueType: ValueType.INT,
    });
    this.provingJobTransactions = meter.createGauge(Metrics.PROVER_NODE_JOB_TRANSACTIONS, {
      description: 'Number of transactions in a proven epoch',
      valueType: ValueType.INT,
    });

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

    this.txTotalFee = meter.createHistogram(Metrics.L1_PUBLISHER_TX_TOTAL_FEE, {
      description: 'How much L1 tx costs',
      unit: 'gwei',
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.002, 0.004, 0.008, 0.01, 0.02, 0.04, 0.08, 0.1, 0.2, 0.4, 0.8, 1, 1.2, 1.4, 1.8, 2,
        ],
      },
    });

    this.senderBalance = meter.createGauge(Metrics.L1_PUBLISHER_BALANCE, {
      unit: 'eth',
      description: 'The balance of the sender address',
      valueType: ValueType.DOUBLE,
    });
  }

  recordFailedTx() {
    this.txCount.add(1, {
      [Attributes.L1_TX_TYPE]: 'submitProof',
      [Attributes.OK]: false,
    });
  }

  recordSubmitProof(durationMs: number, stats: L1PublishProofStats) {
    this.recordTx(durationMs, stats);
  }

  public recordProvingJob(executionTimeMs: number, totalTimeMs: number, numBlocks: number, numTxs: number) {
    this.proverEpochExecutionDuration.record(Math.ceil(executionTimeMs));
    this.provingJobDuration.record(totalTimeMs / 1000);
    this.provingJobBlocks.record(Math.floor(numBlocks));
    this.provingJobTransactions.record(Math.floor(numTxs));
  }

  public recordSenderBalance(wei: bigint, senderAddress: string) {
    const eth = parseFloat(formatEther(wei, 'wei'));
    this.senderBalance.record(eth, {
      [Attributes.SENDER_ADDRESS]: senderAddress,
    });
  }

  private recordTx(durationMs: number, stats: L1PublishStats) {
    const attributes = {
      [Attributes.L1_TX_TYPE]: 'submitProof',
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

    const executionFee = stats.gasUsed * stats.gasPrice;
    const blobFee = stats.blobGasUsed * stats.blobDataGas;
    const totalFee = executionFee + blobFee;

    try {
      this.txTotalFee.record(parseFloat(formatEther(totalFee)));
    } catch (e) {
      // ignore
    }
  }
}
