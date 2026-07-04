import type { AztecNode } from '@aztec/aztec.js/node';
import type { Logger } from '@aztec/foundation/log';
import type { BlockResponse } from '@aztec/stdlib/interfaces/client';
import type { TopicType } from '@aztec/stdlib/p2p';
import { Tx, type TxReceipt } from '@aztec/stdlib/tx';

import { createHistogram } from 'perf_hooks';

/** Metrics class for proving-related benchmarks. */
export class ProvingMetrics {
  private successfulTxs: number | undefined;
  private proofDuration: number | undefined;
  private activeAgents: number | undefined;
  private avgQueueTime: number | undefined;
  private jobRetries: number | undefined;
  private jobDuration: number | undefined;
  private timedOutJobs: number | undefined;
  private resolvedJobs: number | undefined;
  private rejectedJobs: number | undefined;
  private epochProvingDuration: number | undefined;
  private provenTransactions: number | undefined;
  private provenBlocks: number | undefined;

  constructor(private prefix: string) {}

  recordSuccessfulTxs(count: number): void {
    this.successfulTxs = count;
  }

  recordProofDuration(seconds: number): void {
    this.proofDuration = seconds;
  }

  recordActiveAgents(count: number): void {
    this.activeAgents = count;
  }

  recordAvgQueueTime(ms: number): void {
    this.avgQueueTime = ms;
  }

  recordJobRetries(count: number): void {
    this.jobRetries = count;
  }

  recordJobDuration(ms: number): void {
    this.jobDuration = ms;
  }

  recordTimedOutJobs(count: number): void {
    this.timedOutJobs = count;
  }

  recordResolvedJobs(count: number): void {
    this.resolvedJobs = count;
  }

  recordRejectedJobs(count: number): void {
    this.rejectedJobs = count;
  }

  recordEpochProvingDuration(seconds: number): void {
    this.epochProvingDuration = seconds;
  }

  recordProvenTransactions(count: number): void {
    this.provenTransactions = count;
  }

  recordProvenBlocks(count: number): void {
    this.provenBlocks = count;
  }

  toGithubActionBenchmarkJSON(): Array<{ name: string; unit: string; value: number }> {
    const data: Array<{ name: string; unit: string; value: number }> = [];

    if (this.successfulTxs !== undefined) {
      data.push({ name: `${this.prefix}/successful_txs`, unit: 'count', value: this.successfulTxs });
    }

    if (this.proofDuration !== undefined) {
      data.push({ name: `${this.prefix}/proof_duration`, unit: 's', value: this.proofDuration });
    }

    if (this.activeAgents !== undefined) {
      data.push({ name: `${this.prefix}/active_agents`, unit: 'count', value: this.activeAgents });
    }

    if (this.avgQueueTime !== undefined) {
      data.push({ name: `${this.prefix}/avg_queue_time`, unit: 'ms', value: this.avgQueueTime });
    }

    if (this.jobRetries !== undefined) {
      data.push({ name: `${this.prefix}/job_retries`, unit: 'count', value: this.jobRetries });
    }

    if (this.jobDuration !== undefined) {
      data.push({ name: `${this.prefix}/job_duration`, unit: 'ms', value: this.jobDuration });
    }

    if (this.timedOutJobs !== undefined) {
      data.push({ name: `${this.prefix}/timed_out_jobs`, unit: 'count', value: this.timedOutJobs });
    }

    if (this.resolvedJobs !== undefined) {
      data.push({ name: `${this.prefix}/resolved_jobs`, unit: 'count', value: this.resolvedJobs });
    }

    if (this.rejectedJobs !== undefined) {
      data.push({ name: `${this.prefix}/rejected_jobs`, unit: 'count', value: this.rejectedJobs });
    }

    if (this.epochProvingDuration !== undefined) {
      data.push({ name: `${this.prefix}/epoch_proving_duration`, unit: 's', value: this.epochProvingDuration });
    }

    if (this.provenTransactions !== undefined) {
      data.push({ name: `${this.prefix}/proven_transactions`, unit: 'count', value: this.provenTransactions });
    }

    if (this.provenBlocks !== undefined) {
      data.push({ name: `${this.prefix}/proven_blocks`, unit: 'count', value: this.provenBlocks });
    }

    const scenario = process.env.BENCH_SCENARIO?.trim();
    if (!scenario) {
      return data;
    }

    const scenarioPrefix = `scenario/${scenario}/`;
    return data.map(entry => ({ ...entry, name: `${scenarioPrefix}${entry.name}` }));
  }
}

export type TxInclusionData = {
  txHash: string;
  /** Wall-clock at client when the tx was submitted, in ms (Date.now()). */
  sentAtMs: number;
  /** Wall-clock at client when the block containing the tx first became visible, in ms (Date.now()). -1 if never observed. */
  minedAtMs: number;
  /** Reserved for future attestation-observed-at signal; -1 today. */
  attestedAtMs: number;
  blocknumber: number;
  priorityFee: number;
  totalFee: number;
  positionInBlock: number;
  group: string;
};

export class TxInclusionMetrics {
  private data = new Map<string, TxInclusionData>();
  private groups = new Set<string>();
  private blocks = new Map<number, Promise<BlockResponse<{ includeTransactions: true }> | undefined>>();

  private p2pGossipLatencyByTopic: Partial<Record<TopicType, { p50: number; p95: number }>> = {};

  private attestationLatency: { p50: number; p95: number } | undefined;
  private attestationCounts: { success: number; failedBad: number; failedNode: number } | undefined;
  private reqRespStats: { fraction: number; delayP50: number; delayP95: number } | undefined;
  private peerStats: { avgCount: number; connectionDurationP50: number; connectionDurationP95: number } | undefined;
  private mempoolMinedDelay:
    | { txP50: number; txP95: number; attestationP50: number; attestationP95: number }
    | undefined;
  private inclusionOutcome: { mined: number; failed: number } | undefined;

  constructor(
    private aztecNode: AztecNode,
    private logger?: Logger,
  ) {}

  recordSentTx(tx: Tx, group: string): void {
    const txHash = tx.getTxHash().toString();
    const priorityFees = tx.getGasSettings().maxPriorityFeesPerGas;

    if (this.data.has(txHash)) {
      this.logger?.debug(`Overwriting tx inclusion data for ${txHash}`, { txHash, group });
    }

    this.data.set(txHash, {
      txHash,
      sentAtMs: Date.now(),
      minedAtMs: -1,
      attestedAtMs: -1,
      blocknumber: -1,
      priorityFee: Number(priorityFees.feePerDaGas + priorityFees.feePerL2Gas),
      totalFee: -1,
      positionInBlock: -1,
      group,
    });
    this.groups.add(group);
  }

  /**
   * Stamp mined-at metadata for any tracked tx contained in this block, using
   * `observedAtMs` (caller-supplied wall-clock at the moment they first saw the
   * block). Idempotent: existing minedAtMs is preserved so the first observer
   * wins (typically the block-watcher; recordMinedTx is a fallback).
   */
  observeBlockForMinedTxs(
    blockNumber: number,
    txHashes: ReadonlyArray<{ toString(): string }>,
    observedAtMs: number,
  ): void {
    txHashes.forEach((txHash, position) => {
      const data = this.data.get(txHash.toString());
      if (!data || data.minedAtMs !== -1) {
        return;
      }
      data.blocknumber = blockNumber;
      data.minedAtMs = observedAtMs;
      data.positionInBlock = position;
    });
  }

  async recordMinedTx(txReceipt: TxReceipt): Promise<void> {
    const { txHash, blockNumber } = txReceipt;
    if (!txReceipt.isMined() || !txReceipt.hasExecutionSucceeded() || !blockNumber) {
      this.logger?.debug('Skipping mined tx record due to receipt status', {
        txHash: txHash.toString(),
        status: txReceipt.status,
        blockNumber,
      });
      return;
    }

    const data = this.data.get(txHash.toString());
    if (!data) {
      const message = `Missing sent tx record for mined tx ${txHash.toString()}`;
      this.logger?.warn(message, { txHash: txHash.toString(), blockNumber });
      throw new Error(message);
    }
    data.totalFee = Number(txReceipt.transactionFee ?? 0n);

    // Fallback path for txs the block-watcher missed (e.g. observed only after
    // the watcher stopped). Stamp with the block's L2 slot timestamp; this is
    // earlier than the true client-observed time by attestation+propagation
    // lag, but it's the only deterministic timestamp available post-hoc.
    if (data.minedAtMs === -1) {
      if (!this.blocks.has(blockNumber)) {
        this.blocks.set(blockNumber, this.aztecNode.getBlock(blockNumber, { includeTransactions: true }));
      }
      const block = await this.blocks.get(blockNumber)!;
      if (!block) {
        this.logger?.warn('Failed to load block for mined tx receipt', { txHash: txHash.toString(), blockNumber });
        return;
      }
      data.blocknumber = blockNumber;
      data.minedAtMs = Number(block.header.globalVariables.timestamp) * 1000;
      data.positionInBlock = block.body.txEffects.findIndex(txEffect => txEffect.txHash.equals(txHash));
    }
  }

  /**
   * Whether this tx was ever observed in a block (by the block-watcher or a mined receipt).
   * Idempotent first-sighting semantics: a later reorg / pool eviction never clears it, so callers
   * can treat "ever mined" as included regardless of what happens to the tx afterwards.
   */
  public wasMined(txHash: string): boolean {
    const d = this.data.get(txHash);
    return !!d && d.minedAtMs !== -1;
  }

  /** Per-tx inclusion records for a group. Used to serialise out for downstream tooling. */
  getInclusionRecords(group?: string): TxInclusionData[] {
    const out: TxInclusionData[] = [];
    for (const tx of this.data.values()) {
      if (group !== undefined && tx.group !== group) {
        continue;
      }
      out.push({ ...tx });
    }
    return out;
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
    let nonPositive = 0;
    for (const tx of this.data.values()) {
      if (!tx.blocknumber || tx.group !== group || tx.minedAtMs === -1) {
        continue;
      }

      // Both timestamps are client wall-clock (ms). A negative delta should be
      // impossible since the watcher stamps minedAtMs strictly after sentAtMs,
      // but the fallback path (recordMinedTx via L2 slot timestamp) can stamp
      // earlier than sentAtMs. perf_hooks.createHistogram rejects <=0; skip
      // those instead of crashing.
      const deltaMs = tx.minedAtMs - tx.sentAtMs;
      if (deltaMs <= 0) {
        nonPositive++;
        continue;
      }
      // Histogram is recorded in seconds (rounded) to match the existing
      // toGithubActionBenchmarkJSON output unit; per-tx records carry the raw ms.
      histogram.record(Math.max(1, Math.round(deltaMs / 1000)));
    }
    if (nonPositive > 0) {
      this.logger?.debug(`Dropped ${nonPositive} tx inclusion samples with non-positive delta`, { group });
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

  /** Mined vs failed counts for the high-value lane — recorded instead of asserting strict 1:1 inclusion. */
  public recordInclusionOutcome(mined: number, failed: number): void {
    this.inclusionOutcome = { mined, failed };
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
          name: `${group}/p50_inclusion`,
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

    if (this.inclusionOutcome) {
      const { mined, failed } = this.inclusionOutcome;
      const total = mined + failed;
      data.push(
        { name: 'inclusion/mined_count', unit: 'count', value: mined },
        { name: 'inclusion/failed_count', unit: 'count', value: failed },
        { name: 'inclusion/success_ratio', unit: 'ratio', value: total > 0 ? mined / total : 0 },
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
