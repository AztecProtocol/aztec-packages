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

const TEST_TIMEOUT = 180_000;
jest.setTimeout(TEST_TIMEOUT);

type DistributionPattern = 'uniform' | 'sparse' | 'pinned-only';
type CollectorType = 'batch-requester' | 'send-batch-request';

interface BenchmarkResult {
  txCount: number;
  distribution: DistributionPattern;
  collector: CollectorType;
  durationMs: number;
  fetchedCount: number;
  success: boolean;
}

describe('ProposalTxCollector Benchmarks', () => {
  let txPool: MockProxy<TxPool>;
  let attestationPool: MockProxy<AttestationPool>;
  let epochCache: MockProxy<EpochCache>;
  let worldState: MockProxy<WorldStateSynchronizer>;
  let connectionSampler: MockProxy<ConnectionSampler>;
  let mockP2PService: MockProxy<BatchTxRequesterLibP2PService>;
  let logger: Logger;
  let p2pBaseConfig: P2PConfig;

  let clients: P2PClient[] = [];
  const results: BenchmarkResult[] = [];

  beforeAll(() => {
    logger = createLogger('p2p:bench');
  });

  afterAll(() => {
    outputResults(results);
  });

  const setupMocks = () => {
    clients = [];
    txPool = mock<TxPool>();
    attestationPool = mock<AttestationPool>();
    epochCache = mock<EpochCache>();
    worldState = mock<WorldStateSynchronizer>();
    connectionSampler = mock<ConnectionSampler>();
    mockP2PService = mock<BatchTxRequesterLibP2PService>({ connectionSampler });
    mockP2PService.txValidator.mockResolvedValue(true);

    p2pBaseConfig = { ...emptyChainConfig, ...getP2PDefaultConfig() };

    //@ts-expect-error - we want to mock the getEpochAndSlotInNextL1Slot method
    epochCache.getEpochAndSlotInNextL1Slot.mockReturnValue({ ts: BigInt(0) });
    epochCache.getRegisteredValidators.mockResolvedValue([]);

    txPool.hasTxs.mockResolvedValue([]);
    txPool.getAllTxs.mockImplementation(() => Promise.resolve([] as Tx[]));
    txPool.addTxs.mockResolvedValue(1);
    txPool.getTxsByHash.mockImplementation(() => Promise.resolve([] as Tx[]));

    worldState.status.mockResolvedValue({
      state: mock(),
      syncSummary: {
        latestBlockNumber: BlockNumber(0),
        latestBlockHash: '',
        finalizedBlockNumber: BlockNumber(0),
        treesAreSynched: false,
        oldestHistoricBlockNumber: BlockNumber(0),
      },
    });
  };

  const teardown = async () => {
    logger.info(`Tearing down...`);
    await Promise.all(clients.map(client => client.stop()));
    await sleep(500);
    clients = [];
    jest.restoreAllMocks();
  };

  beforeEach(() => {
    setupMocks();
    logger.info(`Starting test ${expect.getState().currentTestName}`);
  });

  afterEach(async () => {
    await teardown();
  });

  const createBlockProposal = (blockNumber: number, blockHash: Fr, txHashes: TxHash[]) => {
    return makeBlockProposal({
      signer: Secp256k1Signer.random(),
      header: makeL2BlockHeader(1, blockNumber),
      archive: blockHash,
      txHashes,
    });
  };

  const setupClients = async (numberOfPeers: number, txPoolMocks: MockProxy<TxPool>[]) => {
    logger.info(`Setting up ${numberOfPeers} clients...`);
    const peerIdPrivateKeys = generatePeerIdPrivateKeys(numberOfPeers);
    let ports: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        ports = await getPorts(numberOfPeers);
        break;
      } catch {
        await sleep(500);
      }
    }
    if (ports.length === 0) {
      throw new Error('Failed to get ports');
    }

    const peerEnrs = await makeEnrs(peerIdPrivateKeys, ports, p2pBaseConfig);

    for (let i = 0; i < numberOfPeers; i++) {
      const client = await makeAndStartTestP2PClient(peerIdPrivateKeys[i], ports[i], peerEnrs, {
        p2pBaseConfig,
        mockAttestationPool: attestationPool,
        mockTxPool: txPoolMocks[i],
        mockEpochCache: epochCache,
        mockWorldState: worldState,
        logger: createLogger(`p2p:${i}`),
        p2pConfigOverrides: {
          maxPeerCount: numberOfPeers,
        },
      });
      clients.push(client);
    }
    logger.info(`Created ${numberOfPeers} clients`);
  };

  async function waitForPeers(numberOfPeers: number) {
    logger.info(`Waiting for peers to discover each other...`);
    await Promise.all(
      clients.map((c, i) =>
        retryUntil(
          async () => (await c.getPeers()).length >= numberOfPeers - 1,
          `peers discovered for client ${i}`,
          30,
          1,
        ),
      ),
    );
    logger.info('Peers connected');
  }

  const createTxPoolMock = (peerTxs: Tx[]): MockProxy<TxPool> => {
    const peerTxPool = mock<TxPool>();
    const peerTxSet = new Set(peerTxs.map(tx => tx.txHash.toString()));

    peerTxPool.hasTxs.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(hashes.map(h => peerTxSet.has(h.toString())));
    });
    peerTxPool.getTxsByHash.mockImplementation((hashes: TxHash[]) => {
      return Promise.resolve(hashes.map(hash => peerTxs.find(t => t.txHash.equals(hash))));
    });
    peerTxPool.getTxByHash.mockImplementation((hash: TxHash) => {
      return Promise.resolve(peerTxs.find(t => t.txHash.equals(hash)));
    });
    peerTxPool.getAllTxs.mockImplementation(() => Promise.resolve(peerTxs));
    peerTxPool.addTxs.mockResolvedValue(1);

    return peerTxPool;
  };

  const generateTxDistribution = (
    txs: Tx[],
    numberOfPeers: number,
    pattern: DistributionPattern,
  ): MockProxy<TxPool>[] => {
    const txPoolMocks: MockProxy<TxPool>[] = [];
    const peerTxSets: Tx[][] = [];

    for (let i = 0; i < numberOfPeers; i++) {
      let peerTxs: Tx[];
      switch (pattern) {
        case 'uniform':
          peerTxs = txs;
          break;
        case 'sparse': {
          const numDataPeers = numberOfPeers - 1;
          const peerIndex = i - 1;
          peerTxs = txs.filter((_, txIndex) => {
            const bucket = txIndex % numDataPeers;
            return bucket === peerIndex || bucket === (peerIndex + 1) % numDataPeers;
          });
          break;
        }
        case 'pinned-only':
          peerTxs = i === 1 ? txs : [];
          break;
      }
      txPoolMocks.push(createTxPoolMock(peerTxs));
      peerTxSets.push(peerTxs);
    }

    return txPoolMocks;
  };

  const runCollector = async (
    collectorType: CollectorType,
    txHashes: TxHash[],
    blockProposal: ReturnType<typeof createBlockProposal>,
    pinnedPeer: any,
    timeoutMs: number,
  ): Promise<Tx[]> => {
    const [aggregator] = clients;
    const reqResp = (aggregator as any).p2pService.reqresp;
    mockP2PService.reqResp = reqResp;

    // Connection sampler returns all peer ids except the one we are testing for aka "aggregator"
    const peerIds = clients.map(client => (client as any).p2pService.node.peerId).slice(1);
    connectionSampler.getPeerListSortedByConnectionCountAsc.mockReturnValue(peerIds);

    const internalSampler = (reqResp as any).connectionSampler;
    logger.info(
      `Setting up mocks for ${collectorType}, otherPeerIds: ${peerIds.map(p => p.toString().slice(-8)).join(', ')}`,
    );
    jest.spyOn(internalSampler, 'getPeerListSortedByConnectionCountAsc').mockReturnValue(peerIds);
    jest.spyOn(internalSampler, 'samplePeersBatch').mockImplementation((...args: unknown[]) => {
      const numberToSample = args[0] as number;
      const excluding = args[1] as Map<string, boolean> | undefined;
      const filtered = peerIds.filter(p => !excluding?.has(p.toString()));
      const result = filtered.slice(0, Math.min(numberToSample, filtered.length));
      logger.info(`samplePeersBatch mock returning: ${result.map(p => p.toString().slice(-8)).join(', ')}`);
      return result;
    });
    jest.spyOn(internalSampler, 'getPeer').mockImplementation((...args: unknown[]) => {
      const excluding = args[0] as Map<string, boolean> | undefined;
      const filtered = peerIds.filter(p => !excluding?.has(p.toString()));
      return filtered.length > 0 ? filtered[0] : undefined;
    });

    // Override rate limiter to allow unlimited requests for benchmarking
    // Must mock on ALL clients (both requester/aggregator and responder/peer sides)
    const unlimitedQuota = {
      peerLimit: { quotaTimeMs: 1000, quotaCount: 10_000 },
      globalLimit: { quotaTimeMs: 1000, quotaCount: 100_000 },
    };
    for (const client of clients) {
      const clientReqResp = (client as any).p2pService.reqresp;
      const clientRateLimiter = clientReqResp.rateLimiter;
      jest.spyOn(clientRateLimiter, 'getRateLimits').mockReturnValue(unlimitedQuota);
      jest.spyOn(clientRateLimiter, 'allow').mockReturnValue(RateLimitStatus.Allowed);
    }

    if (collectorType === 'batch-requester') {
      const collector = new BatchTxRequesterCollector(mockP2PService, logger, new DateProvider());
      return await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    } else {
      const maxPeers = 10;
      // Allow enough retries to cycle through all peers for each index
      // In sparse distribution, each tx might need to try multiple peers before finding one that has it
      const maxRetryAttempts = clients.length * 2;
      const collector = new SendBatchRequestCollector(mockP2PService, maxPeers, maxRetryAttempts);
      return await collector.collectTxs(txHashes, blockProposal, pinnedPeer, timeoutMs);
    }
  };

  it('benchmark: uniform distribution', async () => {
    const txCount = 100;
    const numberOfPeers = 10;
    const distribution: DistributionPattern = 'uniform';
    const timeoutMs = 20_000;

    for (const collectorType of ['batch-requester', 'send-batch-request'] as CollectorType[]) {
      await teardown();
      setupMocks();

      logger.info(`Running ${collectorType}...`);
      const txs = await Promise.all(times(txCount, i => createMockTxWithMetadata(p2pBaseConfig, i)));
      const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      const blockProposal = createBlockProposal(1, Fr.random(), txHashes);

      const txPoolMocks = generateTxDistribution(txs, numberOfPeers, distribution);
      await setupClients(numberOfPeers, txPoolMocks);
      await waitForPeers(numberOfPeers);

      attestationPool.getBlockProposal.mockResolvedValue(blockProposal);

      const timer = new Timer();

      try {
        const fetchedTxs = await runCollector(collectorType, txHashes, blockProposal, undefined, timeoutMs);
        const durationMs = timer.ms();

        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs,
          fetchedCount: fetchedTxs.length,
          success: fetchedTxs.length === txCount,
        });

        logger.info(`${collectorType}: fetched ${fetchedTxs.length}/${txCount} in ${durationMs.toFixed(0)}ms`);
      } catch (err: any) {
        logger.error(`${collectorType} failed: ${err.message}`);
        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs: timeoutMs,
          fetchedCount: 0,
          success: false,
        });
      }
    }

    expect(results.length).toBeGreaterThan(0);
  });

  it('benchmark: sparse distribution', async () => {
    const txCount = 50;
    const numberOfPeers = 10;
    const distribution: DistributionPattern = 'sparse';
    const timeoutMs = 20_000;

    for (const collectorType of ['batch-requester', 'send-batch-request'] as CollectorType[]) {
      await teardown();
      setupMocks();

      logger.info(`Running ${collectorType}...`);
      const txs = await Promise.all(times(txCount, i => createMockTxWithMetadata(p2pBaseConfig, i)));
      const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      const blockProposal = createBlockProposal(2, Fr.random(), txHashes);

      const txPoolMocks = generateTxDistribution(txs, numberOfPeers, distribution);
      await setupClients(numberOfPeers, txPoolMocks);
      await waitForPeers(numberOfPeers);

      attestationPool.getBlockProposal.mockResolvedValue(blockProposal);

      try {
        const timer = new Timer();
        const fetchedTxs = await runCollector(collectorType, txHashes, blockProposal, undefined, timeoutMs);
        const durationMs = timer.ms();

        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs,
          fetchedCount: fetchedTxs.length,
          success: fetchedTxs.length === txCount,
        });

        logger.info(`${collectorType}: fetched ${fetchedTxs.length}/${txCount} in ${durationMs.toFixed(0)}ms`);
      } catch (err: any) {
        console.error(`${collectorType} failed: ${err.message}`);
        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs: timeoutMs,
          fetchedCount: 0,
          success: false,
        });
      }
    }

    expect(results.length).toBeGreaterThan(0);
  });

  it('benchmark: pinned-only distribution with 8 txs', async () => {
    const txCount = 50;
    const numberOfPeers = 4;
    const distribution: DistributionPattern = 'pinned-only';
    const timeoutMs = 10_000;

    for (const collectorType of ['batch-requester', 'send-batch-request'] as CollectorType[]) {
      await teardown();
      setupMocks();

      logger.info(`Running ${collectorType}...`);
      const txs = await Promise.all(times(txCount, i => createMockTxWithMetadata(p2pBaseConfig, i)));
      const txHashes = await Promise.all(txs.map(tx => tx.getTxHash()));
      const blockProposal = createBlockProposal(3, Fr.random(), txHashes);

      const txPoolMocks = generateTxDistribution(txs, numberOfPeers, distribution);
      await setupClients(numberOfPeers, txPoolMocks);
      await waitForPeers(numberOfPeers);

      attestationPool.getBlockProposal.mockResolvedValue(blockProposal);
      const pinnedPeer = (clients[1] as any).p2pService.node.peerId;

      try {
        const timer = new Timer();
        const fetchedTxs = await runCollector(collectorType, txHashes, blockProposal, pinnedPeer, timeoutMs);
        const durationMs = timer.ms();

        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs,
          fetchedCount: fetchedTxs.length,
          success: fetchedTxs.length === txCount,
        });

        logger.info(`${collectorType}: fetched ${fetchedTxs.length}/${txCount} in ${durationMs.toFixed(0)}ms`);
      } catch (err: any) {
        console.error(`${collectorType} failed: ${err.message}`);
        results.push({
          txCount,
          distribution,
          collector: collectorType,
          durationMs: timeoutMs,
          fetchedCount: 0,
          success: false,
        });
      }
    }

    expect(results.length).toBeGreaterThan(0);
  });
});

/* eslint-disable no-console */
function outputResults(benchResults: BenchmarkResult[]) {
  const lines: string[] = [];

  if (benchResults.length === 0) {
    console.log('No benchmark results to display');
    return;
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('ProposalTxCollector Benchmark Results');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push('| Collector           | Distribution | TXs | Duration (ms) | Fetched | Success |');
  lines.push('|---------------------|--------------|-----|---------------|---------|---------|');

  for (const r of benchResults) {
    lines.push(
      `| ${r.collector.padEnd(19)} | ${r.distribution.padEnd(12)} | ${String(r.txCount).padStart(3)} | ` +
        `${r.durationMs.toFixed(0).padStart(13)} | ${String(r.fetchedCount).padStart(7)} | ${r.success ? '  Yes  ' : '  No   '} |`,
    );
  }

  lines.push('');
  lines.push('## Comparison Summary');
  lines.push('');

  const distributions = [...new Set(benchResults.map(r => r.distribution))];
  for (const dist of distributions) {
    const batchResult = benchResults.find(r => r.distribution === dist && r.collector === 'batch-requester');
    const sendResult = benchResults.find(r => r.distribution === dist && r.collector === 'send-batch-request');

    if (batchResult && sendResult) {
      const diff = sendResult.durationMs - batchResult.durationMs;
      const winner = diff > 0 ? 'BatchTxRequester' : 'SendBatchRequest';
      const percentage = Math.abs(diff / sendResult.durationMs) * 100;
      lines.push(`- ${dist}: ${winner} is ${percentage.toFixed(1)}% ${diff > 0 ? 'faster' : 'slower'}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');

  console.log(lines.join('\n'));
}
/* eslint-enable no-console */
