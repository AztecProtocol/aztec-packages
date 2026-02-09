import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalCore,
} from '@aztec/stdlib/p2p';
import { type BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

import EventEmitter from 'events';

import type { TryAddResult } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { RateLimitStatus } from '../services/reqresp/rate-limiter/rate_limiter.js';

/**
 * In-memory TxPool implementation for testing.
 * Provides basic tx storage without persistence.
 */
export class InMemoryTxPool extends EventEmitter implements TxPool {
  private txsByHash = new Map<string, Tx>();
  private logger: Logger | null = null;

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  setTxs(txs: Tx[]): number {
    this.txsByHash.clear();
    return this.appendTxs(txs);
  }

  appendTxs(txs: Tx[]): number {
    let added = 0;
    for (const tx of txs) {
      const key = tx.getTxHash().toString();
      if (!this.txsByHash.has(key)) {
        added += 1;
      }
      this.txsByHash.set(key, tx);
    }
    return added;
  }

  clearTxs(): void {
    this.txsByHash.clear();
  }

  resetState(): void {
    this.txsByHash.clear();
    this.removeAllListeners();
  }

  addTxs(txs: Tx[], opts?: { source?: string }): Promise<number> {
    const newTxs: Tx[] = [];
    let added = 0;
    for (const tx of txs) {
      const key = tx.getTxHash().toString();
      if (!this.txsByHash.has(key)) {
        newTxs.push(tx);
        added += 1;
      }
      this.txsByHash.set(key, tx);
    }
    if (newTxs.length > 0) {
      this.emit('txs-added', { txs: newTxs, source: opts?.source });
    }
    return Promise.resolve(added);
  }

  getTxByHash(hash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(this.txsByHash.get(hash.toString()));
  }

  getTxsByHash(hashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const result = hashes.map(h => this.txsByHash.get(h.toString()));
    const found = result.filter(tx => tx !== undefined).length;
    this.logger?.debug(`[TxPool] getTxsByHash: requested ${hashes.length}, found ${found}`);
    return Promise.resolve(result);
  }

  hasTxs(hashes: TxHash[]): Promise<boolean[]> {
    return Promise.resolve(hashes.map(h => this.txsByHash.has(h.toString())));
  }

  hasTx(hash: TxHash): Promise<boolean> {
    return Promise.resolve(this.txsByHash.has(hash.toString()));
  }

  getArchivedTxByHash(_hash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(undefined);
  }

  async markAsMined(_txHashes: TxHash[], _blockHeader: BlockHeader): Promise<void> {}

  async markMinedAsPending(_txHashes: TxHash[], _latestBlock: BlockNumber): Promise<void> {}

  deleteTxs(txHashes: TxHash[], _opts?: { permanently?: boolean }): Promise<void> {
    for (const txHash of txHashes) {
      this.txsByHash.delete(txHash.toString());
    }
    return Promise.resolve();
  }

  getAllTxs(): Promise<Tx[]> {
    return Promise.resolve([...this.txsByHash.values()]);
  }

  getAllTxHashes(): Promise<TxHash[]> {
    return Promise.resolve([...this.txsByHash.keys()].map(key => TxHash.fromString(key)));
  }

  getPendingTxHashes(): Promise<TxHash[]> {
    return Promise.resolve([...this.txsByHash.keys()].map(key => TxHash.fromString(key)));
  }

  getPendingTxCount(): Promise<number> {
    return Promise.resolve(this.txsByHash.size);
  }

  getMinedTxHashes(): Promise<[tx: TxHash, blockNumber: BlockNumber][]> {
    return Promise.resolve([]);
  }

  getTxStatus(hash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    return Promise.resolve(this.txsByHash.has(hash.toString()) ? 'pending' : undefined);
  }

  updateConfig(_config: { maxPendingTxCount?: number; archivedTxLimit?: number }): void {}

  isEmpty(): Promise<boolean> {
    return Promise.resolve(this.txsByHash.size === 0);
  }

  async markTxsAsNonEvictable(_txHashes: TxHash[]): Promise<void> {}

  async clearNonEvictableTxs(): Promise<void> {}

  cleanupDeletedMinedTxs(_blockNumber: BlockNumber): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * In-memory AttestationPool mock for testing/benchmarking.
 * Provides minimal implementation without persistence.
 */
export class InMemoryAttestationPool {
  private proposals = new Map<string, BlockProposal>();

  tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddResult> {
    const id = blockProposal.archive.toString();
    const alreadyExists = this.proposals.has(id);
    if (alreadyExists) {
      return Promise.resolve({ added: false, alreadyExists: true, totalForPosition: 1 });
    }
    this.proposals.set(id, blockProposal);
    return Promise.resolve({ added: true, alreadyExists: false, totalForPosition: 1 });
  }

  getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    return Promise.resolve(this.proposals.get(id));
  }

  tryAddCheckpointProposal(_proposal: CheckpointProposal): Promise<TryAddResult> {
    return Promise.resolve({ added: true, alreadyExists: false, totalForPosition: 1 });
  }

  getCheckpointProposal(_id: string): Promise<CheckpointProposalCore | undefined> {
    return Promise.resolve(undefined);
  }

  async addOwnCheckpointAttestations(_attestations: CheckpointAttestation[]): Promise<void> {}

  async deleteOlderThan(_slot: SlotNumber): Promise<void> {}

  getCheckpointAttestationsForSlot(_slot: SlotNumber): Promise<CheckpointAttestation[]> {
    return Promise.resolve([]);
  }

  getCheckpointAttestationsForSlotAndProposal(
    _slot: SlotNumber,
    _proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    return Promise.resolve([]);
  }

  tryAddCheckpointAttestation(_attestation: CheckpointAttestation, _committeeSize: number): Promise<TryAddResult> {
    return Promise.resolve({ added: true, alreadyExists: false, totalForPosition: 1 });
  }

  isEmpty(): Promise<boolean> {
    return Promise.resolve(this.proposals.size === 0);
  }

  resetState(): void {
    this.proposals.clear();
  }
}

/**
 * Creates a mock EpochCache for testing.
 */
export function createMockEpochCache(): EpochCacheInterface {
  return {
    getCommittee: () => Promise.resolve({ committee: [], seed: 1n, epoch: EpochNumber.ZERO, isEscapeHatchOpen: false }),
    getProposerIndexEncoding: () => '0x' as `0x${string}`,
    getEpochAndSlotNow: () => ({ epoch: EpochNumber.ZERO, slot: SlotNumber.ZERO, ts: 0n, nowMs: 0n }),
    computeProposerIndex: () => 0n,
    getCurrentAndNextSlot: () => ({ currentSlot: SlotNumber.ZERO, nextSlot: SlotNumber.ZERO }),
    getProposerAttesterAddressInSlot: () => Promise.resolve(undefined),
    getEpochAndSlotInNextL1Slot: () => ({ epoch: EpochNumber.ZERO, slot: SlotNumber.ZERO, ts: 0n, now: 0n }),
    isInCommittee: () => Promise.resolve(false),
    getRegisteredValidators: () => Promise.resolve([]),
    filterInCommittee: () => Promise.resolve([]),
    getL1Constants: () => ({
      l1StartBlock: 0n,
      l1GenesisTime: 0n,
      epochDuration: 1,
      slotDuration: 1,
      ethereumSlotDuration: 1,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
    }),
  };
}

/**
 * Creates a mock WorldStateSynchronizer for testing.
 */
export function createMockWorldStateSynchronizer(): WorldStateSynchronizer {
  return {
    status: () =>
      Promise.resolve({
        syncSummary: {
          latestBlockNumber: 0,
          latestBlockHash: '',
          finalizedBlockNumber: 0,
          treesAreSynched: false,
          oldestHistoricBlockNumber: 0,
        },
      }),
  } as WorldStateSynchronizer;
}

/**
 * Unlimited rate limit configuration for benchmarks.
 */
export const UNLIMITED_RATE_LIMIT_QUOTA = {
  peerLimit: { quotaTimeMs: 1000, quotaCount: 10_000 },
  globalLimit: { quotaTimeMs: 1000, quotaCount: 100_000 },
};

/**
 * Installs unlimited rate limits on a ReqResp instance.
 * Used in benchmarks to avoid rate limiting affecting results.
 *
 * Note: Uses `as any` because rateLimiter is private. This is acceptable
 * in test code where we need to override internal behavior.
 */
export function installUnlimitedRateLimitsOnReqResp(reqResp: any): void {
  const rateLimiter = reqResp.rateLimiter;
  rateLimiter.getRateLimits = () => UNLIMITED_RATE_LIMIT_QUOTA;
  rateLimiter.allow = () => RateLimitStatus.Allowed;
}

/**
 * Distribution patterns for benchmark transaction distribution.
 */
export type DistributionPattern = 'uniform' | 'sparse' | 'pinned-only';

/**
 * Collector implementation types for benchmarking.
 */
export type CollectorType = 'batch-requester' | 'send-batch-request';

/**
 * Display names for collector types (for output/logging only).
 */
export const COLLECTOR_DISPLAY_NAMES: Record<CollectorType, string> = {
  'batch-requester': 'batch-requester (new)',
  'send-batch-request': 'send-batch-request (old)',
};

/**
 * Benchmark timing constants.
 */
export const BENCHMARK_CONSTANTS = {
  /** Time to wait for peers to connect before starting benchmark */
  PEER_DISCOVERY_WAIT_MS: 10_000,
  /** Maximum time to wait for peer connections */
  MAX_PEER_WAIT_MS: 60_000,
  /** Interval between peer connection checks */
  PEER_CHECK_INTERVAL_MS: 500,
  /** Default worker ready timeout */
  WORKER_READY_TIMEOUT_MS: 30_000,
  /** Graceful shutdown timeout before force kill */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: 5_000,
  /** Overall cleanup timeout */
  CLEANUP_TIMEOUT_MS: 10_000,
  /** Buffer time for internal timeout to ensure we return before outer timeout */
  TIMEOUT_BUFFER_MS: 5_000,
  /** Minimum internal timeout regardless of buffer */
  MIN_INTERNAL_TIMEOUT_MS: 1_000,
  /** Fixed max peers for fair benchmarking */
  FIXED_MAX_PEERS: 10,
  /** Fixed max retry attempts for fair benchmarking */
  FIXED_MAX_RETRY_ATTEMPTS: 3,
  /** LMDB map size for temp stores used in benchmarks (in KB). */
  KV_STORE_MAP_SIZE_KB: 256 * 1024,
} as const;

/**
 * Filters transactions based on distribution pattern for benchmark responders.
 *
 * @param allTxs - All transactions to filter
 * @param peerIndex - Index of the current peer (0 = aggregator)
 * @param peerCount - Total number of peers
 * @param distribution - Distribution pattern to apply
 * @param pinnedPeerIndex - Index of the pinned peer (for pinned-only distribution)
 * @returns Filtered transactions for this peer
 */
export function filterTxsByDistribution(
  allTxs: Tx[],
  peerIndex: number,
  peerCount: number,
  distribution: DistributionPattern,
  pinnedPeerIndex: number = 1,
): Tx[] {
  if (peerIndex === 0) {
    return [];
  }

  const responderCount = peerCount - 1;

  switch (distribution) {
    case 'uniform':
      return allTxs;

    case 'sparse': {
      const responderIndex = peerIndex - 1;
      return allTxs.filter((_, txIndex) => {
        const bucket = txIndex % responderCount;
        return bucket === responderIndex || bucket === (responderIndex + 1) % responderCount;
      });
    }

    case 'pinned-only':
      return peerIndex === pinnedPeerIndex ? allTxs : [];
  }
}

/**
 * Calculates the internal timeout for collector operations.
 * Ensures we return before the outer timeout while maintaining a minimum.
 */
export function calculateInternalTimeout(timeoutMs: number): number {
  return Math.max(timeoutMs - BENCHMARK_CONSTANTS.TIMEOUT_BUFFER_MS, BENCHMARK_CONSTANTS.MIN_INTERNAL_TIMEOUT_MS);
}
