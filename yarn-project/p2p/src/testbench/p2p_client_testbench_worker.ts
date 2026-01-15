/**
 * A testbench worker that creates a p2p client and listens for commands from the parent.
 *
 * Used when running testbench commands.
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
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  type BlockProposal,
  type CheckpointAttestation,
  type CheckpointProposal,
  type CheckpointProposalCore,
  P2PClientType,
  P2PMessage,
} from '@aztec/stdlib/p2p';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { makeAztecAddress, makeBlockProposal, makeL2BlockHeader, mockTx } from '@aztec/stdlib/testing';
import { type BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import EventEmitter from 'events';

import type { P2PClient } from '../client/p2p_client.js';
import type { P2PConfig } from '../config.js';
import { createP2PClient } from '../index.js';
import type { AttestationPool } from '../mem_pools/attestation_pool/attestation_pool.js';
import type { MemPools } from '../mem_pools/interface.js';
import type { TxPool } from '../mem_pools/tx_pool/index.js';
import { LibP2PService } from '../services/libp2p/libp2p_service.js';
import type { PeerManager } from '../services/peer-manager/peer_manager.js';
import type { BatchTxRequesterLibP2PService } from '../services/reqresp/batch-tx-requester/interface.js';
import { RateLimitStatus } from '../services/reqresp/rate-limiter/rate_limiter.js';
import type { ReqResp } from '../services/reqresp/reqresp.js';
import type { PeerDiscoveryService } from '../services/service.js';
import {
  BatchTxRequesterCollector,
  SendBatchRequestCollector,
} from '../services/tx_collection/proposal_tx_collector.js';
import { AlwaysTrueCircuitVerifier } from '../test-helpers/reqresp-nodes.js';
import type { PubSubLibp2p } from '../util.js';

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
  pinnedPeerId?: string;
  blockNumber: number;
  seed: number;
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

  resetState(): void {
    this.txsByHash.clear();
    this.removeAllListeners();
  }

  async addTxs(txs: Tx[], opts?: { source?: string }): Promise<number> {
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
    return added;
  }

  async getTxByHash(hash: TxHash): Promise<Tx | undefined> {
    return this.txsByHash.get(hash.toString());
  }

  async getTxsByHash(hashes: TxHash[]): Promise<(Tx | undefined)[]> {
    const result = hashes.map(h => this.txsByHash.get(h.toString()));
    const found = result.filter(tx => tx !== undefined).length;
    this.logger?.debug(`[TxPool] getTxsByHash: requested ${hashes.length}, found ${found}`);
    return result;
  }

  async hasTxs(hashes: TxHash[]): Promise<boolean[]> {
    return hashes.map(h => this.txsByHash.has(h.toString()));
  }

  async hasTx(hash: TxHash): Promise<boolean> {
    return this.txsByHash.has(hash.toString());
  }

  async getArchivedTxByHash(_hash: TxHash): Promise<Tx | undefined> {
    return undefined;
  }

  async markAsMined(_txHashes: TxHash[], _blockHeader: BlockHeader): Promise<void> {}

  async markMinedAsPending(_txHashes: TxHash[], _latestBlock: BlockNumber): Promise<void> {}

  async deleteTxs(txHashes: TxHash[], _opts?: { permanently?: boolean }): Promise<void> {
    for (const txHash of txHashes) {
      this.txsByHash.delete(txHash.toString());
    }
  }

  async getAllTxs(): Promise<Tx[]> {
    return [...this.txsByHash.values()];
  }

  async getAllTxHashes(): Promise<TxHash[]> {
    return [...this.txsByHash.keys()].map(key => TxHash.fromString(key));
  }

  async getPendingTxHashes(): Promise<TxHash[]> {
    return [...this.txsByHash.keys()].map(key => TxHash.fromString(key));
  }

  async getPendingTxCount(): Promise<number> {
    return this.txsByHash.size;
  }

  async getMinedTxHashes(): Promise<[tx: TxHash, blockNumber: BlockNumber][]> {
    return [];
  }

  async getTxStatus(hash: TxHash): Promise<'pending' | 'mined' | 'deleted' | undefined> {
    return this.txsByHash.has(hash.toString()) ? 'pending' : undefined;
  }

  updateConfig(_config: { maxPendingTxCount?: number; archivedTxLimit?: number }): void {}

  async isEmpty(): Promise<boolean> {
    return this.txsByHash.size === 0;
  }

  async markTxsAsNonEvictable(_txHashes: TxHash[]): Promise<void> {}

  async clearNonEvictableTxs(): Promise<void> {}

  async cleanupDeletedMinedTxs(_blockNumber: BlockNumber): Promise<number> {
    return 0;
  }
}

class StatefulAttestationPool implements AttestationPool {
  private proposals = new Map<string, BlockProposal>();

  async addBlockProposal(blockProposal: BlockProposal): Promise<void> {
    this.proposals.set(blockProposal.archive.toString(), blockProposal);
  }

  async getBlockProposal(id: string): Promise<BlockProposal | undefined> {
    return this.proposals.get(id);
  }

  async hasBlockProposal(idOrProposal: string | BlockProposal): Promise<boolean> {
    const id = typeof idOrProposal === 'string' ? idOrProposal : idOrProposal.archive.toString();
    return this.proposals.has(id);
  }

  async canAddProposal(_block: BlockProposal): Promise<boolean> {
    return true;
  }

  async addCheckpointProposal(_proposal: CheckpointProposal): Promise<void> {}

  async getCheckpointProposal(_id: string): Promise<CheckpointProposalCore | undefined> {
    return undefined;
  }

  async hasCheckpointProposal(_idOrProposal: string | CheckpointProposal): Promise<boolean> {
    return false;
  }

  async addCheckpointAttestations(_attestations: CheckpointAttestation[]): Promise<void> {}

  async deleteCheckpointAttestationsOlderThan(_slot: SlotNumber): Promise<void> {}

  async getCheckpointAttestationsForSlot(_slot: SlotNumber): Promise<CheckpointAttestation[]> {
    return [];
  }

  async getCheckpointAttestationsForSlotAndProposal(
    _slot: SlotNumber,
    _proposalId: string,
  ): Promise<CheckpointAttestation[]> {
    return [];
  }

  async hasCheckpointAttestation(_attestation: CheckpointAttestation): Promise<boolean> {
    return false;
  }

  async canAddCheckpointProposal(_proposal: CheckpointProposal): Promise<boolean> {
    return true;
  }

  async canAddCheckpointAttestation(_attestation: CheckpointAttestation, _committeeSize: number): Promise<boolean> {
    return true;
  }

  async hasReachedCheckpointProposalCap(_slot: SlotNumber): Promise<boolean> {
    return false;
  }

  async hasReachedCheckpointAttestationCap(
    _slot: SlotNumber,
    _proposalId: string,
    _committeeSize: number,
  ): Promise<boolean> {
    return false;
  }

  async isEmpty(): Promise<boolean> {
    return this.proposals.size === 0;
  }

  resetState(): void {
    this.proposals.clear();
  }
}

const txCache = new Map<number, Tx[]>();

function mockEpochCache(): EpochCacheInterface {
  return {
    getCommittee: () => Promise.resolve({ committee: [], seed: 1n, epoch: EpochNumber.ZERO, isEscapeHatchOpen: false }),
    getProposerIndexEncoding: () => '0x' as `0x${string}`,
    getEpochAndSlotNow: () => ({ epoch: EpochNumber.ZERO, slot: SlotNumber.ZERO, ts: 0n }),
    computeProposerIndex: () => 0n,
    getCurrentAndNextSlot: () => ({
      currentSlot: SlotNumber.ZERO,
      nextSlot: SlotNumber.ZERO,
    }),
    getProposerAttesterAddressInSlot: () => Promise.resolve(undefined),
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

class TestLibP2PService<T extends P2PClientType = P2PClientType.Full> extends LibP2PService<T> {
  private disableTxValidation: boolean;
  private gossipMessageCount = 0;

  constructor(
    clientType: T,
    config: P2PConfig,
    node: PubSubLibp2p,
    peerDiscoveryService: PeerDiscoveryService,
    reqresp: ReqResp,
    peerManager: PeerManager,
    mempools: MemPools,
    archiver: L2BlockSource & ContractDataSource,
    epochCache: EpochCacheInterface,
    proofVerifier: ClientProtocolCircuitVerifier,
    worldStateSynchronizer: WorldStateSynchronizer,
    telemetry: TelemetryClient,
    logger = createLogger('p2p:test:libp2p_service'),
    disableTxValidation = true,
  ) {
    super(
      clientType,
      config,
      node,
      peerDiscoveryService,
      reqresp,
      peerManager,
      mempools,
      archiver,
      epochCache,
      proofVerifier,
      worldStateSynchronizer,
      telemetry,
      logger,
    );
    this.disableTxValidation = disableTxValidation;
  }

  public getGossipMessageCount(): number {
    return this.gossipMessageCount;
  }

  public setDisableTxValidation(disable: boolean): void {
    this.disableTxValidation = disable;
  }

  protected override async handleGossipedTx(payload: Buffer, msgId: string, source: PeerId) {
    if (this.disableTxValidation) {
      const p2pMessage = P2PMessage.fromMessageData(payload);
      const tx = Tx.fromBuffer(p2pMessage.payload);
      this.node.services.pubsub.reportMessageValidationResult(msgId, source.toString(), TopicValidatorResult.Accept);

      const txHash = tx.getTxHash();
      const txHashString = txHash.toString();
      this.logger.verbose(`Received tx ${txHashString} from external peer ${source.toString()}.`);
      await this.mempools.txPool.addTxs([tx]);
    } else {
      await super.handleGossipedTx(payload, msgId, source);
    }
  }

  protected override async handleNewGossipMessage(msg: Message, msgId: string, source: PeerId) {
    this.gossipMessageCount++;
    process.send!({
      type: 'GOSSIP_RECEIVED',
      count: this.gossipMessageCount,
    });
    await super.handleNewGossipMessage(msg, msgId, source);
  }
}

async function generateDeterministicTxs(txCount: number, seed: number, config: P2PConfig): Promise<Tx[]> {
  const cached = txCache.get(seed) ?? [];
  if (cached.length >= txCount) {
    return cached.slice(0, txCount);
  }

  const includeByTimestampBase = BigInt(seed);
  for (let i = cached.length; i < txCount; i++) {
    const txSeed = seed * 10000 + i;
    const tx = await mockTx(txSeed, {
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
      feePayer: makeAztecAddress(txSeed + 1),
      chonkProof: ChonkProof.empty(),
      numberOfNonRevertiblePublicCallRequests: 0,
      numberOfRevertiblePublicCallRequests: 0,
      numberOfRevertibleNullifiers: 0,
      hasPublicTeardownCallRequest: false,
      publicCalldataSize: 0,
    });
    tx.data.includeByTimestamp = includeByTimestampBase + BigInt(i);
    await tx.recomputeHash();
    cached.push(tx);
  }

  txCache.set(seed, cached);
  return cached.slice(0, txCount);
}

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

async function createBlockProposal(blockNumber: number, txHashes: TxHash[], seed: number): Promise<BlockProposal> {
  const archiveRoot = new Fr(BigInt(seed) * 1000000n + BigInt(blockNumber));
  return await makeBlockProposal({
    signer: Secp256k1Signer.random(),
    blockHeader: makeL2BlockHeader(1, blockNumber),
    archiveRoot,
    txHashes,
  });
}

function installUnlimitedRateLimits(client: P2PClient): void {
  const reqResp = (client as any).p2pService.reqresp as any;
  const rateLimiter = reqResp.rateLimiter as any;

  const unlimitedQuota = {
    peerLimit: { quotaTimeMs: 1000, quotaCount: 10_000 },
    globalLimit: { quotaTimeMs: 1000, quotaCount: 100_000 },
  };

  rateLimiter.getRateLimits = () => unlimitedQuota;
  rateLimiter.allow = () => RateLimitStatus.Allowed;
}

async function runAggregatorBenchmark(
  client: P2PClient,
  blockProposal: BlockProposal,
  collectorType: CollectorType,
  timeoutMs: number,
  pinnedPeerId: string | undefined,
  pinnedPeerIndex: number | undefined,
  logger: Logger,
  expectedPeerCount: number,
): Promise<BenchResultMessage> {
  let timer = new Timer();
  try {
    installUnlimitedRateLimits(client);

    const txHashes = blockProposal.txHashes;
    logger.info(`[BENCH] Using block proposal with archive ${blockProposal.archive.toString().slice(0, 10)}...`);

    const p2pService = (client as any).p2pService;
    const reqResp = p2pService.reqresp;
    const connectionSampler =
      typeof reqResp.getConnectionSampler === 'function' ? reqResp.getConnectionSampler() : reqResp.connectionSampler;

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

    const connectedPeers = connectionSampler.getPeerListSortedByConnectionCountAsc();
    logger.info(`[BENCH] Aggregator has ${connectedPeers.length} connected peers`);
    logger.info(
      `[BENCH] Requesting ${txHashes.length} tx hashes: ${txHashes
        .slice(0, 3)
        .map(h => h.toString())
        .join(', ')}...`,
    );

    const mockService: BatchTxRequesterLibP2PService = {
      reqResp,
      connectionSampler,
      txValidator: async () => true,
    };

    let pinnedPeer: PeerId | undefined;
    if (pinnedPeerId) {
      pinnedPeer = peerIdFromString(pinnedPeerId);
    } else if (pinnedPeerIndex !== undefined) {
      if (pinnedPeerIndex > 0 && pinnedPeerIndex <= connectedPeers.length) {
        pinnedPeer = connectedPeers[pinnedPeerIndex - 1];
      }
    }

    // Use fixed, comparable parameters for fair benchmarking
    const FIXED_MAX_PEERS = 10;
    const FIXED_MAX_RETRY_ATTEMPTS = 3;

    timer = new Timer();
    if (collectorType === 'batch-requester') {
      const collector = new BatchTxRequesterCollector(mockService, logger, new DateProvider());
      const fetchedTxs = await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
      const durationMs = timer.ms();
      return {
        type: 'BENCH_RESULT',
        durationMs,
        fetchedCount: fetchedTxs.length,
        success: fetchedTxs.length === txHashes.length,
      };
    }

    const collector = new SendBatchRequestCollector(mockService, FIXED_MAX_PEERS, FIXED_MAX_RETRY_ATTEMPTS);
    const fetchedTxs = await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    const durationMs = timer.ms();
    return {
      type: 'BENCH_RESULT',
      durationMs,
      fetchedCount: fetchedTxs.length,
      success: fetchedTxs.length === txHashes.length,
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
let kvStore: Awaited<ReturnType<typeof openTmpStore>> | null = null;

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', async msg => {
  const {
    type,
    config: rawConfig,
    clientIndex,
  } = msg as {
    type: string;
    config: Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey?: string };
    clientIndex: number;
  };

  try {
    if (type === 'START') {
      const config: P2PConfig = {
        ...rawConfig,
        peerIdPrivateKey: rawConfig.peerIdPrivateKey ? new SecretValue(rawConfig.peerIdPrivateKey) : undefined,
      } as P2PConfig;

      workerConfig = config;
      workerTxPool = new StatefulTxPool();
      workerAttestationPool = new StatefulAttestationPool();
      const epochCache = mockEpochCache();
      const worldState = mockWorldStateSynchronizer();
      const l2BlockSource = new MockL2BlockSource();

      const proofVerifier = new AlwaysTrueCircuitVerifier();
      kvStore = await openTmpStore(`test-${clientIndex}`);
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
        proofVerifier as ClientProtocolCircuitVerifier,
        worldState,
        epochCache,
        'test-p2p-bench-worker',
        undefined,
        telemetry as TelemetryClient,
        deps,
      );

      const testService = new TestLibP2PService(
        P2PClientType.Full,
        config,
        (client as any).p2pService.node,
        (client as any).p2pService.peerDiscoveryService,
        (client as any).p2pService.reqresp,
        (client as any).p2pService.peerManager,
        (client as any).p2pService.mempools,
        (client as any).p2pService.archiver,
        epochCache,
        proofVerifier,
        worldState,
        telemetry as TelemetryClient,
        workerLogger,
        true,
      );

      (client as any).p2pService = testService;

      await client.start();
      for (let i = 0; i < 100; i++) {
        const isReady = client.isReady();
        workerLogger.debug(`Client ${clientIndex} isReady: ${isReady}`);
        if (isReady) {
          break;
        }
        await sleep(1000);
      }

      workerClient = client;
      const peerId = (client as any).p2pService.node.peerId.toString();
      process.send!({ type: 'READY', peerId });
      return;
    }

    const cmd = msg as any;
    switch (cmd.type) {
      case 'STOP':
        if (workerClient) {
          await workerClient.stop();
        }
        if (kvStore?.close) {
          await kvStore.close();
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

        // Reset state before each benchmark run to avoid cross-run contamination
        workerTxPool.resetState();
        workerAttestationPool.resetState();

        installUnlimitedRateLimits(workerClient);

        const allTxs = await generateDeterministicTxs(benchCmd.txCount, benchCmd.seed, workerConfig);
        const txHashes = allTxs.map(tx => tx.getTxHash());
        const blockProposal = await createBlockProposal(benchCmd.blockNumber, txHashes, benchCmd.seed);

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
            benchCmd.pinnedPeerId,
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
