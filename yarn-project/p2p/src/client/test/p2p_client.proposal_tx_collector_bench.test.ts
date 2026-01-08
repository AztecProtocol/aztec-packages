import type { EpochCache } from '@aztec/epoch-cache';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { emptyChainConfig } from '@aztec/stdlib/config';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { makeBlockProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { P2PClient } from '../../client/p2p_client.js';
import { type P2PConfig, getP2PDefaultConfig } from '../../config.js';
import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import type { TxPool } from '../../mem_pools/tx_pool/index.js';
import type { BatchTxRequesterLibP2PService } from '../../services/reqresp/batch-tx-requester/interface.js';
import type { ConnectionSampler } from '../../services/reqresp/connection-sampler/connection_sampler.js';
import { RateLimitStatus } from '../../services/reqresp/rate-limiter/rate_limiter.js';
import {
  BatchTxRequesterCollector,
  SendBatchRequestCollector,
} from '../../services/tx_collection/proposal_tx_collector.js';
import { generatePeerIdPrivateKeys } from '../../test-helpers/generate-peer-id-private-keys.js';
import { getPorts } from '../../test-helpers/get-ports.js';
import { makeEnrs } from '../../test-helpers/make-enrs.js';
import { makeAndStartTestP2PClient } from '../../test-helpers/make-test-p2p-clients.js';
import { createMockTxWithMetadata } from '../../test-helpers/mock-tx-helpers.js';

const TEST_TIMEOUT_MS = 1800_000;
jest.setTimeout(TEST_TIMEOUT_MS);

type DistributionPattern = 'uniform' | 'sparse' | 'pinned-only';

const COLLECTOR_TYPES = ['batch-requester', 'send-batch-request'];
type CollectorType = (typeof COLLECTOR_TYPES)[number];

const PEERS_PER_RUN = 10;
const TIMEOUT_MS = 80_000;

const MISSING_TX_COUNTS = [10, 50, 100, 500];
type MissingTxCount = (typeof MISSING_TX_COUNTS)[number];

interface ScenarioBase {
  name: string;
  distribution: DistributionPattern;
  blockNumber: number;
  pinnedPeerIndex?: number; // index in `clients` array, if applicable
}

interface BenchmarkCase extends ScenarioBase {
  peers: number;
  missingTxCount: MissingTxCount;
  timeoutMs: number;
}

interface BenchmarkResult {
  missingTxCount: number;
  distribution: DistributionPattern;
  collector: CollectorType;
  durationMs: number;
  fetchedCount: number;
  success: boolean;
}

const BASE_SCENARIOS: readonly ScenarioBase[] = [
  {
    name: 'uniform distribution',
    distribution: 'uniform',
    blockNumber: 1,
  },
  {
    name: 'sparse distribution',
    distribution: 'sparse',
    blockNumber: 2,
  },
  {
    name: 'pinned-only distribution',
    distribution: 'pinned-only',
    blockNumber: 3,
    pinnedPeerIndex: 1,
  },
];

const CASES: readonly BenchmarkCase[] = BASE_SCENARIOS.flatMap(base =>
  MISSING_TX_COUNTS.map(missingTxCount => ({
    ...base,
    peers: PEERS_PER_RUN,
    missingTxCount,
    timeoutMs: TIMEOUT_MS,
  })),
);

/**
 * Encapsulates all mutable test state + mocking setup.
 * Keeps the Jest tests themselves small and declarative.
 */
class BenchmarkEnv {
  public clients: P2PClient[] = [];

  public txPool!: MockProxy<TxPool>;
  public attestationPool!: MockProxy<AttestationPool>;
  public epochCache!: MockProxy<EpochCache>;
  public worldState!: MockProxy<WorldStateSynchronizer>;
  public connectionSampler!: MockProxy<ConnectionSampler>;
  public mockP2PService!: MockProxy<BatchTxRequesterLibP2PService>;
  public p2pBaseConfig!: P2PConfig;

  public constructor(private readonly logger: Logger) {}

  public reset(): void {
    this.clients = [];

    this.txPool = mock<TxPool>();
    this.attestationPool = mock<AttestationPool>();
    this.epochCache = mock<EpochCache>();
    this.worldState = mock<WorldStateSynchronizer>();
    this.connectionSampler = mock<ConnectionSampler>();
    this.mockP2PService = mock<BatchTxRequesterLibP2PService>({ connectionSampler: this.connectionSampler });

    this.mockP2PService.txValidator.mockResolvedValue(true);
    this.p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    // @ts-expect-error - deliberately mocking method signature detail for benchmark
    this.epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    this.epochCache.getRegisteredValidators.mockResolvedValue([]);

    this.txPool.hasTxs.mockResolvedValue([]);
    this.txPool.getAllTxs.mockResolvedValue([] as Tx[]);
    this.txPool.addTxs.mockResolvedValue(1);
    this.txPool.getTxsByHash.mockResolvedValue([] as Tx[]);

    this.worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: BlockNumber(0),
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber(0),
        treesAreSynched: false,
        oldestHistoricBlockNumber: BlockNumber(0),
      },
    });
  }

  public async stop(): Promise<void> {
    if (this.clients.length === 0) return;

    this.logger.info(`Tearing down ${this.clients.length} clients...`);
    await Promise.allSettled(this.clients.map(c => c.stop()));
    await sleep(300);
    this.clients = [];
  }

  public createBlockProposal(blockNumber: number, archive: Fr, txHashes: TxHash[]) {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      header: makeL2BlockHeader(1, blockNumber),
      archive,
      txHashes,
    });
  }

  public async startClients(peers: number, txPoolMocks: MockProxy<TxPool>[]): Promise<void> {
    this.logger.info(`Setting up ${peers} clients...`);

    const peerIdPrivateKeys = generatePeerIdPrivateKeys(peers);
    const ports = await getPortsWithRetry(peers, this.logger);

    const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, this.p2pBaseConfig);

    for (let i = 0; i < peers; i++) {
      const client = await makeAndStartTestP2PClient(peerIdPrivateKeys[i], ports[i], peerEnrs, {
        p2pBaseConfig: this.p2pBaseConfig,
        mockAttestationPool: this.attestationPool,
        mockTxPool: txPoolMocks[i],
        mockEpochCache: this.epochCache,
        mockWorldState: this.worldState,
        logger: createLogger(`p2p:${i}`),
        p2pConfigOverrides: { maxPeerCount: peers },
      });
      this.clients.push(client);
    }

    this.logger.info(`Created ${this.clients.length}/${peers} clients`);
  }

  public async waitForFullMesh(peers: number): Promise<void> {
    this.logger.info(`Waiting for peer discovery...`);

    await Promise.all(
      this.clients.map((client, i) =>
        retryUntil(
          async () => (await client.getPeers()).length >= peers - 1,
          `peers discovered for client ${i}`,
          30,
          1,
        ),
      ),
    );

    this.logger.info('Peers connected');
  }

  public async runCollector(
    collectorType: CollectorType,
    txHashes: TxHash[],
    blockProposal: ReturnType<BenchmarkEnv['createBlockProposal']>,
    pinnedPeer: PeerId | undefined,
    timeoutMs: number,
  ): Promise<Tx[]> {
    const [aggregator] = this.clients;
    if (!aggregator) throw new Error('No aggregator client (clients[0]) available');

    const aggregatorReqResp = getReqResp(aggregator);
    (this.mockP2PService as any).reqResp = aggregatorReqResp;

    const peerIds = this.clients.map(getPeerId).slice(1);
    this.connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peerIds);

    this.installSamplerOverrides(aggregatorReqResp, peerIds);
    this.installUnlimitedRateLimits();

    if (collectorType === 'batch-requester') {
      const collector = new BatchTxRequesterCollector(this.mockP2PService, this.logger, new DateProvider());
      return await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    }

    const maxPeers = 10;
    const maxRetryAttempts = this.clients.length * 2;
    const collector = new SendBatchRequestCollector(this.mockP2PService, maxPeers, maxRetryAttempts);
    return await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
  }

  private installSamplerOverrides(reqResp: any, peerIds: PeerId[]): void {
    const internalSampler = reqResp.connectionSampler;

    const shortIds = peerIds.map(p => String(p).slice(-8)).join(', ');
    this.logger.info(`Sampler overrides installed. Peers: ${shortIds}`);

    jest.spyOn(internalSampler, 'getPeerListSortedByConnectionCountAsc').mockReturnValue(peerIds);

    jest.spyOn(internalSampler, 'samplePeersBatch').mockImplementation((...args: unknown[]) => {
      const numberToSample = args[0] as number;
      const excluding = args[1] as Map<string, boolean> | undefined;

      const filtered = peerIds.filter(p => !excluding?.has(String(p)));
      return filtered.slice(0, Math.min(numberToSample, filtered.length));
    });

    jest.spyOn(internalSampler, 'getPeer').mockImplementation((...args: unknown[]) => {
      const excluding = args[0] as Map<string, boolean> | undefined;
      const filtered = peerIds.filter(p => !excluding?.has(String(p)));
      return filtered[0];
    });
  }

  private installUnlimitedRateLimits(): void {
    const unlimitedQuota = {
      peerLimit: { quotaTimeMs: 1000, quotaCount: 10_000 },
      globalLimit: { quotaTimeMs: 1000, quotaCount: 100_000 },
    };

    for (const client of this.clients) {
      const reqResp = getReqResp(client);
      const rateLimiter = reqResp.rateLimiter;

      jest.spyOn(rateLimiter, 'getRateLimits').mockReturnValue(unlimitedQuota);
      jest.spyOn(rateLimiter, 'allow').mockReturnValue(RateLimitStatus.Allowed);
    }
  }
}

describe('ProposalTxCollector Benchmarks', () => {
  const results: BenchmarkResult[] = [];

  let logger: Logger;
  let env: BenchmarkEnv;

  beforeAll(() => {
    logger = createLogger('p2p:bench');
    env = new BenchmarkEnv(logger);
  });

  afterAll(() => {
    outputResults(results);
  });

  beforeEach(() => {
    env.reset();
    logger.info(`Starting test ${expect.getState().currentTestName}`);
  });

  afterEach(async () => {
    try {
      await env.stop();
    } finally {
      jest.restoreAllMocks();
    }
  });

  describe.each(CASES)('$name (missing=$missingTxCount)', benchCase => {
    it.each(COLLECTOR_TYPES)('collector: %s', async collectorType => {
      const { missingTxCount, peers, distribution, timeoutMs, blockNumber } = benchCase;

      logger.info(
        `Case=${benchCase.name}, missing=${missingTxCount}, collector=${collectorType}, peers=${peers}, timeoutMs=${timeoutMs}`,
      );

      const txs = await Promise.all(times(missingTxCount, i => createMockTxWithMetadata(env.p2pBaseConfig, i)));
      const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));

      const blockProposal = env.createBlockProposal(blockNumber, Fr.random(), txHashes);

      const txPoolMocks = generateTxDistribution(txs, peers, distribution, benchCase.pinnedPeerIndex);
      await env.startClients(peers, txPoolMocks);
      await env.waitForFullMesh(peers);

      env.attestationPool.getBlockProposal.mockResolvedValue(blockProposal);

      const pinnedPeer =
        benchCase.pinnedPeerIndex !== undefined ? getPeerId(env.clients[benchCase.pinnedPeerIndex]) : undefined;

      const timer = new Timer();

      try {
        const fetchedTxs = await env.runCollector(collectorType, txHashes, blockProposal, pinnedPeer, timeoutMs);
        const durationMs = timer.ms();

        results.push({
          missingTxCount,
          distribution,
          collector: collectorType,
          durationMs,
          fetchedCount: fetchedTxs.length,
          success: fetchedTxs.length === missingTxCount,
        });

        logger.info(`${collectorType}: fetched ${fetchedTxs.length}/${missingTxCount} in ${durationMs.toFixed(0)}ms`);
      } catch (err: any) {
        const durationMs = timer.ms();

        logger.error(`${collectorType} failed: ${err?.message ?? String(err)}`);

        results.push({
          missingTxCount,
          distribution,
          collector: collectorType,
          durationMs: Math.min(durationMs, timeoutMs),
          fetchedCount: 0,
          success: false,
        });

        throw err;
      }
    });
  });
});

/**
 * Creates a tx-pool mock for a single peer with an in-memory lookup.
 * Keeps the mock behavior consistent and fast.
 */
function createTxPoolMock(peerTxs: Tx[]): MockProxy<TxPool> {
  const peerTxPool = mock<TxPool>();

  const byHash = new Map<string, Tx>();
  for (const tx of peerTxs) {
    byHash.set(tx.txHash.toString(), tx);
  }

  peerTxPool.hasTxs.mockImplementation(async (hashes: TxHash[]) => hashes.map(h => byHash.has(h.toString())));

  peerTxPool.getTxsByHash.mockImplementation(async (hashes: TxHash[]) => {
    const out: Tx[] = [];
    for (const h of hashes) {
      const tx = byHash.get(h.toString());
      if (tx) out.push(tx);
    }
    return out;
  });

  peerTxPool.getTxByHash.mockImplementation(async (hash: TxHash) => byHash.get(hash.toString()));

  peerTxPool.getAllTxs.mockResolvedValue(peerTxs);
  peerTxPool.addTxs.mockResolvedValue(1);

  return peerTxPool;
}

/**
 * Distribution generator.
 * Important: client[0] (aggregator) MUST have zero txs so "missing txs" is real in all scenarios.
 */
function generateTxDistribution(
  txs: Tx[],
  numberOfPeers: number,
  pattern: DistributionPattern,
  pinnedPeerIndex = 1,
): MockProxy<TxPool>[] {
  if (pattern === 'pinned-only' && (pinnedPeerIndex <= 0 || pinnedPeerIndex >= numberOfPeers)) {
    throw new Error(`Invalid pinnedPeerIndex=${pinnedPeerIndex} for peers=${numberOfPeers}`);
  }

  const txPoolMocks: MockProxy<TxPool>[] = [];
  const responderCount = numberOfPeers - 1; // peers[1..] are responders

  for (let i = 0; i < numberOfPeers; i++) {
    // Aggregator always missing everything.
    if (i === 0) {
      txPoolMocks.push(createTxPoolMock([]));
      continue;
    }

    let peerTxs: Tx[] = [];

    switch (pattern) {
      case 'uniform': {
        peerTxs = txs;
        break;
      }

      case 'sparse': {
        const responderIndex = i - 1; // [0..responderCount-1]
        peerTxs = txs.filter((_, txIndex) => {
          const bucket = txIndex % responderCount;
          return bucket === responderIndex || bucket === (responderIndex + 1) % responderCount;
        });
        break;
      }

      case 'pinned-only': {
        peerTxs = i === pinnedPeerIndex ? txs : [];
        break;
      }
    }

    txPoolMocks.push(createTxPoolMock(peerTxs));
  }

  return txPoolMocks;
}

async function getPortsWithRetry(peers: number, logger: Logger): Promise<number[]> {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const ports = await getPorts(peers);
      if (ports.length !== peers) {
        throw new Error(`Expected ${peers} ports, got ${ports.length}`);
      }
      return ports;
    } catch (err: any) {
      const isLast = attempt === maxAttempts - 1;
      if (isLast) {
        throw new Error(`Failed to get ports after ${maxAttempts} attempts: ${err?.message ?? String(err)}`);
      }
      logger.warn(`getPorts attempt ${attempt + 1}/${maxAttempts} failed; retrying...`);
      await sleep(500);
    }
  }

  throw new Error('unreachable');
}

function getReqResp(client: P2PClient): any {
  return (client as any).p2pService.reqresp;
}

function getPeerId(client: P2PClient): PeerId {
  return (client as any).p2pService.node.peerId as PeerId;
}

/* eslint-disable no-console */
function outputResults(benchResults: BenchmarkResult[]) {
  if (benchResults.length === 0) {
    console.log('No benchmark results to display');
    return;
  }

  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('ProposalTxCollector Benchmark Results');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push('| Collector           | Distribution | Missing | Duration (ms) | Fetched | Success |');
  lines.push('|---------------------|--------------|---------|---------------|---------|---------|');

  const sorted = [...benchResults].sort((a, b) => {
    if (a.distribution !== b.distribution) return a.distribution.localeCompare(b.distribution);
    if (a.missingTxCount !== b.missingTxCount) return a.missingTxCount - b.missingTxCount;
    return a.collector.localeCompare(b.collector);
  });

  for (const r of sorted) {
    lines.push(
      `| ${r.collector.padEnd(19)} | ${r.distribution.padEnd(12)} | ${String(r.missingTxCount).padStart(7)} | ` +
        `${r.durationMs.toFixed(0).padStart(13)} | ${String(r.fetchedCount).padStart(7)} | ${r.success ? '  Yes  ' : '  No   '} |`,
    );
  }

  lines.push('');
  lines.push('## Comparison Summary');
  lines.push('');

  const keys = [...new Set(sorted.map(r => `${r.distribution}:${r.missingTxCount}`))];

  for (const key of keys) {
    const [distRaw, missingRaw] = key.split(':');
    const dist = distRaw as DistributionPattern;
    const missing = Number(missingRaw);

    const batch = sorted.find(
      r => r.distribution === dist && r.missingTxCount === missing && r.collector === 'batch-requester',
    );
    const send = sorted.find(
      r => r.distribution === dist && r.missingTxCount === missing && r.collector === 'send-batch-request',
    );

    if (!batch || !send) continue;

    if (!batch.success || !send.success) {
      lines.push(
        `- ${dist} (missing=${missing}): cannot compare reliably (success: batch=${batch.success}, send=${send.success})`,
      );
      continue;
    }

    const faster = batch.durationMs <= send.durationMs ? 'BatchTxRequester' : 'SendBatchRequest';
    const slower = faster === 'BatchTxRequester' ? 'SendBatchRequest' : 'BatchTxRequester';

    const delta = Math.abs(send.durationMs - batch.durationMs);
    const pct = (delta / Math.max(batch.durationMs, send.durationMs)) * 100;

    lines.push(`- ${dist} (missing=${missing}): ${faster} is ${pct.toFixed(1)}% faster than ${slower}`);
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');

  console.log(lines.join('\n'));
}
/* eslint-enable no-console */
