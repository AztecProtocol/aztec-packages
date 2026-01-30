/**
 * Metrics types for tx pool benchmarks.
 */

export enum TxPoolOperation {
  ADD_PENDING_TXS = 'addPendingTxs',
  CAN_ADD_PENDING_TX = 'canAddPendingTx',
  GET_PENDING_TX_HASHES = 'getPendingTxHashes',
  GET_TX_BY_HASH = 'getTxByHash',
  GET_TXS_BY_HASH = 'getTxsByHash',
  HAS_TXS = 'hasTxs',
  HANDLE_MINED_BLOCK = 'handleMinedBlock',
  PREPARE_FOR_SLOT = 'prepareForSlot',
  HANDLE_PRUNED_BLOCKS = 'handlePrunedBlocks',
  GET_LOWEST_PRIORITY_PENDING = 'getLowestPriorityPending',
}

type OperationMetric = {
  operation: TxPoolOperation;
  poolSize: number;
  batchSize: number;
  value: number;
};

/**
 * Collects and formats tx pool benchmark metrics.
 */
export class TxPoolBenchMetrics {
  private metrics: OperationMetric[] = [];

  public addMetric(operation: TxPoolOperation, poolSize: number, batchSize: number, value: number) {
    this.metrics.push({ operation, poolSize, batchSize, value });
  }

  public toPrettyString(): string {
    let pretty = 'TxPool Benchmark Metrics:\n';
    pretty += '='.repeat(60) + '\n';

    // Group by operation
    const byOperation = new Map<TxPoolOperation, OperationMetric[]>();
    for (const metric of this.metrics) {
      if (!byOperation.has(metric.operation)) {
        byOperation.set(metric.operation, []);
      }
      byOperation.get(metric.operation)!.push(metric);
    }

    for (const [operation, opMetrics] of byOperation) {
      pretty += `\n${operation}:\n`;
      for (const metric of opMetrics) {
        const poolSizeStr = metric.poolSize > 0 ? `pool=${metric.poolSize}` : '';
        const batchSizeStr = metric.batchSize > 0 ? `batch=${metric.batchSize}` : '';
        const params = [poolSizeStr, batchSizeStr].filter(Boolean).join(', ');
        pretty += `  ${params ? `(${params})` : ''}: ${metric.value.toFixed(3)} ms\n`;
      }
    }

    return pretty;
  }

  public toGithubActionBenchmarkJSON(indent = 2): string {
    const data = this.metrics.map(metric => {
      const poolSizeStr = metric.poolSize > 0 ? `${metric.poolSize} txs in pool` : '';
      const batchSizeStr = metric.batchSize > 0 ? `batch of ${metric.batchSize}` : '';
      const params = [poolSizeStr, batchSizeStr].filter(Boolean).join('/');

      return {
        name: `TxPool/${metric.operation}${params ? `/${params}` : ''}`,
        value: metric.value,
        unit: 'ms',
      };
    });

    return JSON.stringify(data, null, indent);
  }
}
