/**
 * A testbench worker that creates a p2p client and listens for commands from the parent.
 *
 * Used when running testbench commands.
 */
import { MockL2BlockSource } from '@aztec/archiver/test';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import { type BlockProposal, P2PMessage } from '@aztec/stdlib/p2p';
import { ChonkProof } from '@aztec/stdlib/proofs';
import { makeAztecAddress, makeBlockHeader, makeBlockProposal, mockTx } from '@aztec/stdlib/testing';
import { Tx, TxHash, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { Message, PeerId } from '@libp2p/interface';
import { TopicValidatorResult } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { P2PClient } from '../client/index.js';
import type { P2PConfig } from '../config.js';
import { createP2PClient } from '../index.js';
import type { MemPools } from '../mem_pools/index.js';
import { LibP2PService } from '../services/index.js';
import type { P2PMessageProcessor } from '../services/libp2p/p2p_message_processor.js';
import type { PeerManager } from '../services/peer-manager/peer_manager.js';
import { BatchTxRequester } from '../services/reqresp/batch-tx-requester/batch_tx_requester.js';
import type { BatchTxRequesterLibP2PService } from '../services/reqresp/batch-tx-requester/interface.js';
import { RateLimitStatus } from '../services/reqresp/rate-limiter/rate_limiter.js';
import type { ReqResp } from '../services/reqresp/reqresp.js';
import type { PeerDiscoveryService } from '../services/service.js';
import { RequestTracker } from '../services/tx_collection/request_tracker.js';
import { AlwaysTrueCircuitVerifier } from '../test-helpers/index.js';
import {
  BENCHMARK_CONSTANTS,
  type DistributionPattern,
  InMemoryAttestationPool,
  InMemoryTxPool,
  UNLIMITED_RATE_LIMIT_QUOTA,
  createMockEpochCache,
  createMockWorldStateSynchronizer,
  filterTxsByDistribution,
} from '../test-helpers/index.js';
import type { PubSubLibp2p } from '../util.js';

export type { DistributionPattern } from '../test-helpers/testbench-utils.js';

export interface BenchReqRespCommand {
  type: 'BENCH_REQRESP';
  txCount: number;
  peerCount: number;
  distribution: DistributionPattern;
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
const txCache = new Map<number, Tx[]>();

class TestLibP2PService extends LibP2PService {
  private disableTxValidation: boolean;
  private gossipMessageCount = 0;

  constructor(
    config: P2PConfig,
    node: PubSubLibp2p,
    peerDiscoveryService: PeerDiscoveryService,
    reqresp: ReqResp,
    peerManager: PeerManager,
    processor: P2PMessageProcessor,
    private readonly mempools: MemPools,
    telemetry: TelemetryClient,
    logger = createLogger('p2p:test:libp2p_service'),
    disableTxValidation = true,
  ) {
    super(config, node, peerDiscoveryService, reqresp, peerManager, processor, telemetry, logger);
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
      await this.mempools.txPool.addPendingTxs([tx]);
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

  const expirationTimestampBase = BigInt(seed);
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
    tx.data.expirationTimestamp = expirationTimestampBase + BigInt(i);
    await tx.recomputeHash();
    cached.push(tx);
  }

  txCache.set(seed, cached);
  return cached.slice(0, txCount);
}

async function createBlockProposal(blockNumber: number, txHashes: TxHash[], seed: number): Promise<BlockProposal> {
  const archiveRoot = new Fr(BigInt(seed) * 1000000n + BigInt(blockNumber));
  return await makeBlockProposal({
    signer: Secp256k1Signer.random(),
    blockHeader: makeBlockHeader(1, { blockNumber: BlockNumber(blockNumber) }),
    archiveRoot,
    txHashes,
  });
}

function installUnlimitedRateLimits(client: P2PClient): void {
  const reqResp = (client as any).p2pService.reqresp as any;
  const rateLimiter = reqResp.rateLimiter as any;

  rateLimiter.getRateLimits = () => UNLIMITED_RATE_LIMIT_QUOTA;
  rateLimiter.allow = () => RateLimitStatus.Allowed;
}

/** Resets peer scores to prevent cross-case contamination in benchmarks. */
function resetPeerScores(client: P2PClient): void {
  const peerManager = (client as any).p2pService.peerManager;
  const peerScoring = peerManager?.peerScoring;
  if (peerScoring?.resetAllScores) {
    peerScoring.resetAllScores();
  }
}

/** Returns the number of connected peers for connectivity checks. */
function getConnectedPeerCount(client: P2PClient): number {
  const p2pService = (client as any).p2pService;
  const connectionSampler = p2pService?.reqresp?.getConnectionSampler?.();
  if (connectionSampler?.getPeerListSortedByConnectionCountAsc) {
    return connectionSampler.getPeerListSortedByConnectionCountAsc().length;
  }
  return 0;
}

async function runAggregatorBenchmark(
  client: P2PClient,
  blockProposal: BlockProposal,
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
    const batchTxRequesterService: BatchTxRequesterLibP2PService = p2pService.getBatchTxRequesterService();

    const minPeersRequired = Math.max(1, expectedPeerCount - 1);
    const maxWaitMs = BENCHMARK_CONSTANTS.MAX_PEER_WAIT_MS;
    const waitInterval = BENCHMARK_CONSTANTS.PEER_CHECK_INTERVAL_MS;
    let waited = 0;

    while (waited < maxWaitMs) {
      const connectedPeers = batchTxRequesterService.connectionSampler.getPeerListSortedByConnectionCountAsc();
      if (connectedPeers.length >= minPeersRequired) {
        logger.info(`[BENCH] Aggregator has ${connectedPeers.length} connected peers, starting benchmark`);
        break;
      }
      logger.debug(`[BENCH] Waiting for peers: ${connectedPeers.length}/${minPeersRequired} (waited ${waited}ms)`);
      await sleep(waitInterval);
      waited += waitInterval;
    }

    const connectedPeers = batchTxRequesterService.connectionSampler.getPeerListSortedByConnectionCountAsc();
    logger.info(`[BENCH] Aggregator has ${connectedPeers.length} connected peers`);
    logger.info(
      `[BENCH] Requesting ${txHashes.length} tx hashes: ${txHashes
        .slice(0, 3)
        .map(h => h.toString())
        .join(', ')}...`,
    );

    let pinnedPeer: PeerId | undefined;
    if (pinnedPeerId) {
      pinnedPeer = peerIdFromString(pinnedPeerId);
    } else if (pinnedPeerIndex !== undefined) {
      if (pinnedPeerIndex > 0 && pinnedPeerIndex <= connectedPeers.length) {
        pinnedPeer = connectedPeers[pinnedPeerIndex - 1];
      }
    }

    const noopTxValidator: TxValidator = {
      validateTx: (_tx: Tx): Promise<TxValidationResult> => Promise.resolve({ result: 'valid' }),
    };

    timer = new Timer();
    const tracker = RequestTracker.create(txHashes, new Date(Date.now() + timeoutMs));
    const batchRequester = new BatchTxRequester(
      tracker,
      blockProposal,
      pinnedPeer,
      batchTxRequesterService,
      logger,
      new DateProvider(),
      { txValidator: noopTxValidator },
    );
    const fetchedTxs = await BatchTxRequester.collectAllTxs(batchRequester.run());
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
let workerTxPool: InMemoryTxPool | null = null;
let workerAttestationPool: InMemoryAttestationPool | null = null;
let workerConfig: P2PConfig | null = null;
let workerLogger: Logger | null = null;
let kvStore: Awaited<ReturnType<typeof openTmpStore>> | null = null;

async function stopWorker() {
  try {
    if (workerClient) {
      await workerClient.stop();
      workerClient = null;
    }
  } catch (e) {
    workerLogger?.error('Error stopping worker client', e);
  }
  try {
    if (kvStore?.close) {
      await kvStore.close();
      kvStore = null;
    }
  } catch (e) {
    workerLogger?.error('Error closing kv store', e);
  }
}

function gracefulExit(code: number = 0) {
  try {
    if (process.connected) {
      process.disconnect();
    }
  } catch {
    // IPC channel already closed
  }
  // Safety fallback if lingering handles prevent the event loop from draining
  setTimeout(() => process.exit(code), 5000).unref();
}

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
        priceBumpPercentage: 10n,
      } as P2PConfig;

      workerConfig = config;
      workerTxPool = new InMemoryTxPool();
      workerAttestationPool = new InMemoryAttestationPool();
      const epochCache = createMockEpochCache();
      const worldState = createMockWorldStateSynchronizer();
      const l2BlockSource = new MockL2BlockSource();

      const proofVerifier = new AlwaysTrueCircuitVerifier();
      kvStore = await openTmpStore(`test-${clientIndex}`, true, BENCHMARK_CONSTANTS.KV_STORE_MAP_SIZE_KB);
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
        config as P2PConfig & DataStoreConfig,
        l2BlockSource,
        proofVerifier as ClientProtocolCircuitVerifier,
        worldState,
        epochCache,
        { getCurrentMinFees: () => Promise.resolve(GasFees.empty()) },
        'test-p2p-bench-worker',
        undefined,
        telemetry as TelemetryClient,
        deps,
        await l2BlockSource.getInitialHeader().hash(),
      );

      const testService = new TestLibP2PService(
        config,
        (client as any).p2pService.node,
        (client as any).p2pService.peerDiscoveryService,
        (client as any).p2pService.reqresp,
        (client as any).p2pService.peerManager,
        (client as any).p2pService.processor,
        (client as any).p2pService.processor.mempools,
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
        await stopWorker();
        gracefulExit(0);
        break;

      case 'SEND_TX':
        if (workerClient) {
          await workerClient.sendTx(Tx.fromBuffer(Buffer.from(cmd.tx)));
          process.send!({ type: 'TX_SENT' });
        }
        break;

      case 'GET_PEER_COUNT':
        process.send!({
          type: 'PEER_COUNT',
          count: workerClient ? getConnectedPeerCount(workerClient) : 0,
        });
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
        resetPeerScores(workerClient);

        installUnlimitedRateLimits(workerClient);

        const allTxs = await generateDeterministicTxs(benchCmd.txCount, benchCmd.seed, workerConfig);
        const txHashes = allTxs.map(tx => tx.getTxHash());
        const blockProposal = await createBlockProposal(benchCmd.blockNumber, txHashes, benchCmd.seed);

        await workerAttestationPool.tryAddBlockProposal(blockProposal);
        workerLogger.debug(
          `[BENCH] Added block proposal with archive ${blockProposal.archive.toString().slice(0, 10)}...`,
        );

        if (benchCmd.isAggregator) {
          workerTxPool.clearTxs();

          workerLogger.info(
            `[BENCH] Aggregator starting benchmark: txCount=${benchCmd.txCount}, distribution=${benchCmd.distribution}`,
          );

          const result = await runAggregatorBenchmark(
            workerClient,
            blockProposal,
            benchCmd.timeoutMs,
            benchCmd.pinnedPeerId,
            benchCmd.pinnedPeerIndex,
            workerLogger,
            benchCmd.peerCount,
          );

          process.send!(result);
        } else {
          const myTxs = filterTxsByDistribution(
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
    try {
      process.send!({ type: 'ERROR', error: err.message });
    } catch {
      // IPC channel may be closed
    }
    await stopWorker();
    gracefulExit(1);
  }
});
