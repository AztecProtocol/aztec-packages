/**
 * A testbench worker that creates a p2p client and listens for commands from the parent.
 *
 * Used when running testbench commands
 */
import { MockL2BlockSource } from '@aztec/archiver/test';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { P2PClientType } from '@aztec/stdlib/p2p';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { makeAztecAddress, makeBlockProposal, makeL2BlockHeader, mockTx } from '@aztec/stdlib/testing';
import { type BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';
import EventEmitter from 'events';

import type { P2PClient } from '../client/p2p_client.js';
import type { P2PConfig } from '../config.js';
import { createP2PClient } from '../index.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import type { BatchTxRequesterLibP2PService } from '../services/reqresp/batch-tx-requester/interface.js';
import {
  BatchTxRequesterCollector,
  SendBatchRequestCollector,
} from '../services/tx_collection/proposal_tx_collector.js';
import { AlwaysTrueCircuitVerifier } from '../test-helpers/reqresp-nodes.js';

export type DistributionPattern = 'uniform' | 'sparse' | 'pinned-only';
export type CollectorType = 'batch-requester' | 'send-batch-request';

export interface BenchReqRespCommand {
  type: 'BENCH_REQRESP';
  txCount: number;
  peerCount: number;
  distribution: DistributionPattern;
  collectorType: CollectorType;
  timeoutMs: number;
  isAggregator: boolean;
  peerIndex: number;
  pinnedPeerIndex?: number;
  blockNumber: number;
  seed: number;
  /** Serialized BlockProposal buffer as hex string - all workers add this to their attestation pools */
  blockProposalHex?: string;
}

export interface BenchResultMessage {
  type: 'BENCH_RESULT';
  durationMs: number;
  fetchedCount: number;
  success: boolean;
  error?: string;
}

export interface BenchReadyMessage {
  type: 'BENCH_READY';
}

/**
 * Stateful tx pool mock that can be populated with transactions.
 */
class StatefulTxPool extends EventEmitter implements TxPool {
  private txsByHash = new Map<string, Tx>();
  private logger: Logger | null = null;

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  setTxs(txs: Tx[]): void {
    this.txsByHash.clear();
    for (const tx of txs) {
      const hashStr = tx.getTxHash().toString();
      this.txsByHash.set(hashStr, tx);
    }
    this.logger?.debug(
      `[TxPool] Set ${txs.length} txs, hashes: ${[...this.txsByHash.keys()].slice(0, 3).join(', ')}...`,
    );
  }

  clearTxs(): void {
    this.txsByHash.clear();
  }

  isEmpty(): Promise<boolean> {
    return Promise.resolve(this.txsByHash.size === 0);
  }
  addTxs(_txs: Tx[], _opts?: { source?: string }): Promise<number> {
    return Promise.resolve(1);
  }
  getTxByHash(hash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(this.txsByHash.get(hash.toString()));
  }
  getArchivedTxByHash(_hash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(undefined);
  }
  markAsMined(_txHashes: TxHash[], _blockHeader: BlockHeader): Promise<void> {
    return Promise.resolve();
  }
  markMinedAsPending(_txHashes: TxHash[], _latestBlock: BlockNumber): Promise<void> {
    return Promise.resolve();
  }
  deleteTxs(_txHashes: TxHash[], _opts?: { permanently?: boolean }): Promise<void> {
    return Promise.resolve();
  }
  getAllTxs(): Promise<Tx[]> {
    return Promise.resolve([...this.txsByHash.values()]);
  }
  getAllTxHashes(): Promise<TxHash[]> {
    return Promise.resolve([...this.txsByHash.values()].map(tx => tx.getTxHash()));
  }
  getPendingTxHashes(): Promise<TxHash[]> {
    return Promise.resolve([]);
  }
  getPendingTxCount(): Promise<number> {
    return Promise.resolve(0);
  }
  getMinedTxHashes(): Promise<[TxHash, BlockNumber][]> {
    return Promise.resolve([]);
  }
  getTxStatus(_hash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    return Promise.resolve('pending');
  }
  getTxsByHash(hashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const result: (Tx | undefined)[] = hashes.map(h => this.txsByHash.get(h.toString()));
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
  updateConfig(): void {}
  markTxsAsNonEvictable(_txHashes: TxHash[]): Promise<void> {
    return Promise.resolve();
  }
  clearNonEvictableTxs(): Promise<void> {
    return Promise.resolve();
  }
  cleanupDeletedMinedTxs(_blockNumber: BlockNumber): Promise<number> {
    return Promise.resolve(0);
  }
}

/**
 * Stateful attestation pool mock that can store block proposals.
 */
class StatefulAttestationPool implements AttestationPool {
  private proposals = new Map<string, any>();

  async isEmpty(): Promise<boolean> {
    return this.proposals.size === 0;
  }
  async addAttestations(): Promise<void> {}
  async deleteAttestations(): Promise<void> {}
  async deleteAttestationsOlderThan(): Promise<void> {}
  async deleteAttestationsForSlot(): Promise<void> {}
  async deleteAttestationsForSlotAndProposal(): Promise<void> {}
  async getAttestationsForSlot(): Promise<any[]> {
    return [];
  }
  async getAttestationsForSlotAndProposal(): Promise<any[]> {
    return [];
  }
  async addBlockProposal(proposal: any): Promise<void> {
    // Use archive.toString() as key, matching what the handler uses
    this.proposals.set(proposal.archive.toString(), proposal);
  }
  async getBlockProposal(hash: string): Promise<any | undefined> {
    return this.proposals.get(hash);
  }
  async hasBlockProposal(hash: string): Promise<boolean> {
    return this.proposals.has(hash);
  }
  async hasAttestation(): Promise<boolean> {
    return false;
  }
  async canAddProposal(): Promise<boolean> {
    return true;
  }
  async canAddAttestation(): Promise<boolean> {
    return true;
  }
}

function mockEpochCache(): EpochCacheInterface {
  return {
    getCommittee: () => Promise.resolve({ committee: [], seed: 1n, epoch: EpochNumber.ZERO }),
    getProposerIndexEncoding: () => '0x' as `0x${string}`,
    getEpochAndSlotNow: () => ({ epoch: EpochNumber.ZERO, slot: SlotNumber.ZERO, ts: 0n }),
    computeProposerIndex: () => 0n,
    getProposerAttesterAddressInCurrentOrNextSlot: () =>
      Promise.resolve({
        currentProposer: EthAddress.ZERO,
        nextProposer: EthAddress.ZERO,
        currentSlot: SlotNumber.ZERO,
        nextSlot: SlotNumber.ZERO,
      }),
    getEpochAndSlotInNextL1Slot: () => ({ epoch: EpochNumber.ZERO, slot: SlotNumber.ZERO, ts: 0n, now: 0n }),
    isInCommittee: () => Promise.resolve(false),
    getRegisteredValidators: () => Promise.resolve([]),
    filterInCommittee: () => Promise.resolve([]),
  };
}

function mockWorldStateSynchronizer(): WorldStateSynchronizer {
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
 * Generate deterministic transactions using a seed.
 * All workers use the same seed to generate the same set of txs.
 */
async function generateDeterministicTxs(txCount: number, seed: number, config: P2PConfig): Promise<Tx[]> {
  const txs: Tx[] = [];
  const includeByTimestampBase = BigInt(Math.floor(seed / 1000));
  for (let i = 0; i < txCount; i++) {
    const txSeed = seed * 10000 + i;
    const tx = await mockTx(txSeed, {
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
      feePayer: makeAztecAddress(txSeed + 1),
      chonkProof: ChonkProof.empty(),
    });
    // Ensure fields that mockTx sets non-deterministically are stable across workers.
    tx.data.includeByTimestamp = includeByTimestampBase + BigInt(i);
    await tx.recomputeHash();
    txs.push(tx);
  }
  return txs;
}

/**
 * Filter txs based on distribution pattern and peer index.
 * This mirrors the generateTxDistribution logic from the benchmark test.
 */
function filterByDistribution(
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
 * Create a block proposal from tx hashes.
 * Uses a deterministic archive based on blockNumber and seed so all workers get the same proposal.
 */
function createBlockProposal(blockNumber: number, txHashes: TxHash[], seed: number) {
  // Use deterministic archive derived from seed and blockNumber
  const archiveSeed = BigInt(seed) * 1000000n + BigInt(blockNumber);
  const archive = new Fr(archiveSeed);

  return makeBlockProposal({
    signer: Secp256k1Signer.random(), // Signature doesn't affect archive matching
    header: makeL2BlockHeader(1, blockNumber),
    archive,
    txHashes,
  });
}

/**
 * Run the collector benchmark as the aggregator
 */
async function runAggregatorBenchmark(
  client: P2PClient,
  blockProposal: any, // BlockProposal type
  collectorType: CollectorType,
  timeoutMs: number,
  pinnedPeerIndex: number | undefined,
  logger: Logger,
  expectedPeerCount: number,
): Promise<BenchResultMessage> {
  let timer = new Timer();
  try {
    const txHashes = blockProposal.txHashes;
    logger.info(`[BENCH] Using block proposal with archive ${blockProposal.archive.toString().slice(0, 10)}...`);

    const p2pService = (client as any).p2pService;
    const reqResp = p2pService.reqresp;

    // Get the connection sampler via the public getter
    const connectionSampler = reqResp.getConnectionSampler();

    // Wait for peers to connect before starting the benchmark
    const minPeersRequired = Math.max(1, expectedPeerCount - 1);
    const maxWaitMs = 60_000;
    const waitInterval = 500;
    let waited = 0;

    while (waited < maxWaitMs) {
      const connectedPeers = connectionSampler.getPeerListSortedByConnectionCountAsc();
      if (connectedPeers.length >= minPeersRequired) {
        logger.info(`[BENCH] Aggregator has ${connectedPeers.length} connected peers, starting benchmark`);
        break;
      }
      logger.debug(`[BENCH] Waiting for peers: ${connectedPeers.length}/${minPeersRequired} (waited ${waited}ms)`);
      await sleep(waitInterval);
      waited += waitInterval;
    }

    // Log the connected peers to help debug
    const connectedPeers = connectionSampler.getPeerListSortedByConnectionCountAsc();
    logger.info(`[BENCH] Aggregator has ${connectedPeers.length} connected peers`);
    logger.info(
      `[BENCH] Requesting ${txHashes.length} tx hashes: ${txHashes
        .slice(0, 3)
        .map((h: any) => h.toString())
        .join(', ')}...`,
    );

    const mockService: BatchTxRequesterLibP2PService = {
      reqResp,
      connectionSampler,
      txValidator: () => Promise.resolve(true),
    };

    let pinnedPeer: PeerId | undefined;
    if (pinnedPeerIndex !== undefined) {
      const connectedPeers = reqResp.getConnectionSampler().getPeerListSortedByConnectionCountAsc();
      if (pinnedPeerIndex > 0 && pinnedPeerIndex <= connectedPeers.length) {
        pinnedPeer = connectedPeers[pinnedPeerIndex - 1];
      }
    }

    let fetchedTxs: Tx[];
    timer = new Timer();
    if (collectorType === 'batch-requester') {
      const collector = new BatchTxRequesterCollector(mockService, logger, new DateProvider());
      fetchedTxs = await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    } else {
      const maxPeers = 10;
      const maxRetryAttempts = 10;
      const collector = new SendBatchRequestCollector(mockService, maxPeers, maxRetryAttempts);
      fetchedTxs = await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    }

    const durationMs = timer.ms();
    const success = fetchedTxs.length === txHashes.length;

    return {
      type: 'BENCH_RESULT',
      durationMs,
      fetchedCount: fetchedTxs.length,
      success,
    };
  } catch (err: any) {
    return {
      type: 'BENCH_RESULT',
      durationMs: timer.ms(),
      fetchedCount: 0,
      success: false,
      error: err?.message ?? String(err),
    };
  }
}

let workerClient: P2PClient | null = null;
let workerTxPool: StatefulTxPool | null = null;
let workerAttestationPool: StatefulAttestationPool | null = null;
let workerConfig: P2PConfig | null = null;
let workerLogger: Logger | null = null;

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', async msg => {
  const {
    type,
    config: rawConfig,
    clientIndex,
  } = msg as {
    type: string;
    config: Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey: string };
    clientIndex: number;
  };
  try {
    if (type === 'START') {
      const config: P2PConfig = {
        ...rawConfig,
        peerIdPrivateKey: new SecretValue(rawConfig.peerIdPrivateKey),
      };
      workerConfig = config;
      workerTxPool = new StatefulTxPool();
      workerAttestationPool = new StatefulAttestationPool();
      const epochCache = mockEpochCache();
      const worldState = mockWorldStateSynchronizer();
      const l2BlockSource = new MockL2BlockSource();

      const proofVerifier = new AlwaysTrueCircuitVerifier();
      const kvStore = await openTmpStore(`test-${clientIndex}`);
      workerLogger = createLogger(`p2p:${clientIndex}`);
      workerTxPool.setLogger(workerLogger);
      const telemetry = getTelemetryClient();

      const deps = {
        txPool: workerTxPool,
        attestationPool: workerAttestationPool,
        store: kvStore,
        logger: workerLogger,
      };

      const client = await createP2PClient(
        P2PClientType.Full,
        config as P2PConfig & DataStoreConfig,
        l2BlockSource,
        proofVerifier,
        worldState,
        epochCache,
        'test-p2p-bench-worker',
        undefined,
        telemetry,
        deps,
      );

      // Note: We don't replace the p2pService with TestLibP2PService anymore.
      // The original service has the correct mempools (including our StatefulTxPool)
      // and the reqresp handlers are properly bound to it.

      await client.start();
      // Wait until the client is ready
      for (let i = 0; i < 100; i++) {
        const isReady = client.isReady();
        workerLogger.debug(`Client ${clientIndex} isReady: ${isReady}`);
        if (isReady) {
          break;
        }
        await sleep(1000);
      }

      workerClient = client;
      process.send!({ type: 'READY' });
      return;
    }

    // Handle commands after client is ready
    const cmd = msg as any;
    switch (cmd.type) {
      case 'STOP':
        if (workerClient) {
          await workerClient.stop();
        }
        process.exit(0);
        break;

      case 'SEND_TX':
        if (workerClient) {
          await workerClient.sendTx(Tx.fromBuffer(Buffer.from(cmd.tx)));
          process.send!({ type: 'TX_SENT' });
        }
        break;

      case 'BENCH_REQRESP': {
        const benchCmd = cmd as BenchReqRespCommand;
        if (!workerClient || !workerTxPool || !workerAttestationPool || !workerConfig || !workerLogger) {
          process.send!({
            type: 'BENCH_RESULT',
            durationMs: 0,
            fetchedCount: 0,
            success: false,
            error: 'Worker not initialized',
          } as BenchResultMessage);
          break;
        }

        const allTxs = await generateDeterministicTxs(benchCmd.txCount, benchCmd.seed, workerConfig);
        const txHashes = allTxs.map(tx => tx.getTxHash());

        // Create the block proposal (same for all workers due to deterministic seed)
        const blockProposal = createBlockProposal(benchCmd.blockNumber, txHashes, benchCmd.seed);

        // ALL workers add the proposal to their attestation pools
        // This is needed so:
        // - Responders can return the correct blockHash in their responses
        // - Aggregator can validate responses
        await workerAttestationPool.addBlockProposal(blockProposal);
        workerLogger.debug(
          `[BENCH] Added block proposal with archive ${blockProposal.archive.toString().slice(0, 10)}...`,
        );

        if (benchCmd.isAggregator) {
          workerTxPool.clearTxs();

          workerLogger.info(
            `[BENCH] Aggregator starting benchmark: txCount=${benchCmd.txCount}, collector=${benchCmd.collectorType}, distribution=${benchCmd.distribution}`,
          );

          const result = await runAggregatorBenchmark(
            workerClient,
            blockProposal,
            benchCmd.collectorType,
            benchCmd.timeoutMs,
            benchCmd.pinnedPeerIndex,
            workerLogger,
            benchCmd.peerCount,
          );

          process.send!(result);
        } else {
          const myTxs = filterByDistribution(
            allTxs,
            benchCmd.peerIndex,
            benchCmd.peerCount,
            benchCmd.distribution,
            benchCmd.pinnedPeerIndex,
          );
          workerTxPool.setTxs(myTxs);

          workerLogger.info(
            `[BENCH] Peer ${benchCmd.peerIndex} populated tx pool with ${myTxs.length}/${benchCmd.txCount} txs (${benchCmd.distribution})`,
          );

          process.send!({ type: 'BENCH_READY' } as BenchReadyMessage);
        }
        break;
      }
    }
  } catch (err: any) {
    process.send!({ type: 'ERROR', error: err.message });
    process.exit(1);
  }
});
