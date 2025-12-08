import type { AztecNode } from '@aztec/aztec.js/node';
import type { L2Block } from '@aztec/stdlib/block';
import { Tx, type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { createHistogram } from 'perf_hooks';

export type TxInclusionData = {
  txHash: string;
  sentAt: number;
  minedAt: number;
  attestedAt: number;
  blocknumber: number;
  priorityFee: number;
  totalFee: number;
  positionInBlock: number;
  group: string;
};

export class TxInclusionMetrics {
  private data = new Map<string, TxInclusionData>();
  private groups = new Set<string>();
  private blocks = new Map<number, Promise<L2Block>>();

  constructor(private aztecNode: AztecNode) {}

  recordSentTx(tx: Tx, group: string): void {
    const txHash = tx.getTxHash().toString();
    const priorityFees = tx.getGasSettings().maxPriorityFeesPerGas;

    this.data.set(txHash, {
      txHash,
      sentAt: Math.trunc(Date.now() / 1000),
      minedAt: -1,
      attestedAt: -1,
      blocknumber: -1,
      priorityFee: Number(priorityFees.feePerDaGas + priorityFees.feePerL2Gas),
      totalFee: -1,
      positionInBlock: -1,
      group,
    });
    this.groups.add(group);
  }

  async recordMinedTx(txReceipt: TxReceipt): Promise<void> {
    const { status, txHash, blockNumber } = txReceipt;
    if (status !== TxStatus.SUCCESS || !blockNumber) {
      return;
    }

    if (!this.blocks.has(blockNumber)) {
      this.blocks.set(blockNumber, this.aztecNode.getBlock(blockNumber) as Promise<L2Block>);
    }

    const block = await this.blocks.get(blockNumber)!;
    const data = this.data.get(txHash.toString())!;
    data.blocknumber = blockNumber;
    data.minedAt = Number(block.header.globalVariables.timestamp);
    data.attestedAt = -1;
    data.totalFee = Number(txReceipt.transactionFee ?? 0n);
    data.positionInBlock = block.body.txEffects.findIndex(txEffect => txEffect.txHash.equals(txHash));
  }

  public inclusionTimeInSeconds(group: string): {
    count: number;
    group: string;
    min: number;
    mean: number;
    max: number;
    median: number;
    p99: number;
  } {
    const histogram = createHistogram({});
    for (const tx of this.data.values()) {
      if (!tx.blocknumber || tx.group !== group) {
        continue;
      }

      histogram.record(tx.minedAt - tx.sentAt);
    }

    if (histogram.count === 0) {
      return {
        group,
        count: 0,
        mean: 0,
        max: 0,
        median: 0,
        min: 0,
        p99: 0,
      };
    }

    return {
      group,
      count: histogram.count,
      mean: histogram.mean,
      max: histogram.max,
      median: histogram.percentile(50),
      min: histogram.min,
      p99: histogram.percentile(99),
    };
  }

  toGithubActionBenchmarkJSON(): Array<{ name: string; unit: string; value: number; range?: number; extra?: string }> {
    const data: Array<{ name: string; unit: string; value: number; range?: number; extra?: string }> = [];
    for (const group of this.groups) {
      const stats = this.inclusionTimeInSeconds(group);

      data.push(
        {
          name: `${group}/avg_inclusion`,
          unit: 's',
          value: stats.mean,
        },
        {
          name: `${group}/median_inclusion`,
          unit: 's',
          value: stats.median,
        },
        {
          name: `${group}/p99_inclusion`,
          unit: 's',
          value: stats.p99,
        },
      );
    }

    return data;
  }
}
