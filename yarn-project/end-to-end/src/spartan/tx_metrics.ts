import type { AztecNode } from '@aztec/aztec.js/node';
import type { L2BlockNew } from '@aztec/stdlib/block';
import type { TopicType } from '@aztec/stdlib/p2p';
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
  private blocks = new Map<number, Promise<L2BlockNew | undefined>>();

  private p2pGossipLatencyByTopic: Partial<Record<TopicType, { p50: number; p95: number }>> = {};

  private attestationLatency: { p50: number; p95: number } | undefined;
  private attestationCounts: { success: number; failedBad: number; failedNode: number } | undefined;
  private reqRespStats: { fraction: number; delayP50: number; delayP95: number } | undefined;
  private peerStats: { avgCount: number; connectionDurationP50: number; connectionDurationP95: number } | undefined;
  private mempoolMinedDelay:
    | { txP50: number; txP95: number; attestationP50: number; attestationP95: number }
    | undefined;

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
      this.blocks.set(blockNumber, this.aztecNode.getBlock(blockNumber));
    }

    const block = await this.blocks.get(blockNumber)!;
    if (!block) {
      return;
    }
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
      if (!tx.blocknumber || tx.group !== group || tx.minedAt === -1) {
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

  public recordP2PGossipLatency(topicName: TopicType, p50: number, p95: number): void {
    this.p2pGossipLatencyByTopic[topicName] = { p50, p95 };
  }

  public recordAttestationLatency(p50: number, p95: number): void {
    this.attestationLatency = { p50, p95 };
  }

  public recordAttestationCounts(success: number, failedBad: number, failedNode: number): void {
    this.attestationCounts = { success, failedBad, failedNode };
  }

  public recordReqRespStats(fraction: number, delayP50: number, delayP95: number): void {
    this.reqRespStats = { fraction, delayP50, delayP95 };
  }

  public recordPeerStats(avgCount: number, connectionDurationP50: number, connectionDurationP95: number): void {
    this.peerStats = { avgCount, connectionDurationP50, connectionDurationP95 };
  }

  public recordMempoolMinedDelay(txP50: number, txP95: number, attestationP50: number, attestationP95: number): void {
    this.mempoolMinedDelay = { txP50, txP95, attestationP50, attestationP95 };
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

    for (const [topic, { p50, p95 }] of Object.entries(this.p2pGossipLatencyByTopic)) {
      data.push({
        name: `p2p_gossip_latency/${topic}/p50`,
        unit: 'ms',
        value: p50,
      });
      data.push({
        name: `p2p_gossip_latency/${topic}/p95`,
        unit: 'ms',
        value: p95,
      });
    }

    if (this.attestationLatency) {
      data.push(
        { name: 'attestation_latency/p50', unit: 'ms', value: this.attestationLatency.p50 },
        { name: 'attestation_latency/p95', unit: 'ms', value: this.attestationLatency.p95 },
      );
    }

    if (this.attestationCounts) {
      const { success, failedBad, failedNode } = this.attestationCounts;
      const total = success + failedBad + failedNode;
      const ratio = total > 0 ? success / total : 0;
      data.push(
        { name: 'attestation/success_count', unit: 'count', value: success },
        { name: 'attestation/failed_bad_proposal_count', unit: 'count', value: failedBad },
        { name: 'attestation/failed_node_issue_count', unit: 'count', value: failedNode },
        { name: 'attestation/success_ratio', unit: 'ratio', value: ratio },
      );
    }

    if (this.reqRespStats) {
      data.push(
        { name: 'req_resp/txs_requested_fraction', unit: 'ratio', value: this.reqRespStats.fraction },
        { name: 'req_resp/delay_p50', unit: 'ms', value: this.reqRespStats.delayP50 },
        { name: 'req_resp/delay_p95', unit: 'ms', value: this.reqRespStats.delayP95 },
      );
    }

    if (this.peerStats) {
      data.push(
        { name: 'peers/avg_count', unit: 'peers', value: this.peerStats.avgCount },
        { name: 'peers/connection_duration_p50', unit: 'ms', value: this.peerStats.connectionDurationP50 },
        { name: 'peers/connection_duration_p95', unit: 'ms', value: this.peerStats.connectionDurationP95 },
      );
    }

    if (this.mempoolMinedDelay) {
      data.push(
        { name: 'mempool/tx_mined_delay_p50', unit: 'ms', value: this.mempoolMinedDelay.txP50 },
        { name: 'mempool/tx_mined_delay_p95', unit: 'ms', value: this.mempoolMinedDelay.txP95 },
        { name: 'mempool/attestation_mined_delay_p50', unit: 'ms', value: this.mempoolMinedDelay.attestationP50 },
        { name: 'mempool/attestation_mined_delay_p95', unit: 'ms', value: this.mempoolMinedDelay.attestationP95 },
      );
    }

    const scenario = process.env.BENCH_SCENARIO?.trim();
    if (!scenario) {
      return data;
    }

    const scenarioPrefix = `scenario/${scenario}/`;
    return data.map(entry => ({ ...entry, name: `${scenarioPrefix}${entry.name}` }));
  }
}
