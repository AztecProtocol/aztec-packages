/**
 * Node RPC API Performance Test
 *
 * This test:
 * 1. Sets up a local Aztec node
 * 2. Builds a few blocks by sending transactions
 * 3. Benchmarks all node RPC API methods
 */
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { type Anvil, type RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Timer } from '@aztec/foundation/timer';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { BlockHash } from '@aztec/stdlib/block';
import { ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { AztecNodeDebug } from '@aztec/stdlib/interfaces/client';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import 'jest-extended';
import * as path from 'path';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { type LatencyProxy, startLatencyProxy } from '../fixtures/latency_proxy.js';
import { setup } from '../fixtures/utils.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';

/** Injected per-L1-request latency (ms) used to make L1 round trips dominate any warm-path measurement. */
const INJECTED_L1_LATENCY_MS = 100;

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

/** Number of iterations for fast RPC calls */
const BENCHMARK_ITERATIONS_FAST = 20;

/** Number of iterations for slow RPC calls (e.g., simulations) */
const BENCHMARK_ITERATIONS_SLOW = 5;

/** Number of blocks to build before benchmarking */
const BLOCKS_TO_BUILD = 5;

/** Result structure for benchmark data */
interface BenchmarkResult {
  name: string;
  unit: string;
  value: number;
  min?: number;
  max?: number;
  iterations?: number;
}

/** Timing stats helper */
interface TimingStats {
  avg: number;
  min: number;
  max: number;
  total: number;
  count: number;
}

function calculateStats(timings: number[]): TimingStats {
  if (timings.length === 0) {
    return { avg: 0, min: 0, max: 0, total: 0, count: 0 };
  }
  const total = timings.reduce((a, b) => a + b, 0);
  return {
    avg: total / timings.length,
    min: Math.min(...timings),
    max: Math.max(...timings),
    total,
    count: timings.length,
  };
}

/**
 * Run a benchmark for a given async function
 */
async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number = BENCHMARK_ITERATIONS_FAST,
): Promise<{ result: T; stats: TimingStats }> {
  const timings: number[] = [];
  let lastResult: T | undefined;

  for (let i = 0; i < iterations; i++) {
    const timer = new Timer();
    lastResult = await fn();
    timings.push(timer.ms());
  }

  return {
    result: lastResult!,
    stats: calculateStats(timings),
  };
}

// Node RPC performance benchmark. Uses setup() with PIPELINING_SETUP_OPTS, builds BLOCKS_TO_BUILD blocks,
// then iterates all RPC endpoints measuring avg/min/max latency; emits BENCH_OUTPUT JSON for the bench
// pipeline. Not in test_cmds; runs via bench_cmds.
describe('e2e_node_rpc_perf', () => {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes

  let logger: Logger;
  let aztecNode: AztecNode & AztecNodeDebug;
  let aztecNodeService: AztecNodeService;
  let wallet: TestWallet;
  let ownerAddress: AztecAddress;
  let rollupCheatCodes: RollupCheatCodes;
  let teardown: () => Promise<void>;
  let anvil: Anvil;
  let latencyProxy: LatencyProxy;
  const benchmarkResults: BenchmarkResult[] = [];

  // Data collected during block building for use in benchmarks
  let blockNumber: number;
  let epoch: EpochNumber;
  let contractAddress: AztecAddress;
  let contractClassId: Fr;
  let blockArchive: Fr;
  const txHashes: TxHash[] = [];
  let tokenContract: TokenContract;
  let sampleTx: Tx; // A sample proven tx for benchmarking simulation/validation APIs

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    // Output benchmark results in GitHub Actions benchmark format
    logger.info('Benchmark Results Summary:');
    for (const result of benchmarkResults) {
      logger.info(`  ${result.name}: ${result.value.toFixed(2)} ${result.unit}`);
    }

    // Write results to file if BENCH_OUTPUT is set
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(benchmarkResults, null, 2));
      logger.info(`Benchmark results written to ${process.env.BENCH_OUTPUT}`);
    }

    await teardown();
    await latencyProxy?.stop();
    await anvil?.stop().catch(() => {});
  });

  beforeAll(async () => {
    // Start Anvil directly and put a latency proxy in front of it, so the node talks to L1 through the proxy
    // while we retain the direct Anvil URL for cheat codes. The proxy runs at zero delay during setup.
    let directRpcUrl: string;
    ({ anvil, rpcUrl: directRpcUrl } = await startAnvil());
    latencyProxy = await startLatencyProxy(directRpcUrl, 0);

    ({
      teardown,
      logger,
      aztecNode,
      aztecNodeService,
      wallet,
      accounts: [ownerAddress],
      cheatCodes: { rollup: rollupCheatCodes },
    } = await setup(1, {
      l1RpcUrls: [latencyProxy.url],
      archiverPollingIntervalMS: 200,
      sequencerPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      ...PIPELINING_SETUP_OPTS,
      minTxsPerBlock: 1,
    }));

    logger.info('Deploying token contract...');
    ({ contract: tokenContract } = await TokenContract.deploy(wallet, ownerAddress, 'TestToken', 'TST', 18n).send({
      from: ownerAddress,
    }));
    contractAddress = tokenContract.address;
    logger.info(`Token contract deployed at ${contractAddress}`);

    // Get contract class ID for benchmarking getContractClass
    const contractInstance = await aztecNode.getContract(contractAddress);
    contractClassId = contractInstance!.currentContractClassId;

    logger.info(`Building ${BLOCKS_TO_BUILD} blocks with transactions...`);
    await buildBlocks();

    blockNumber = await aztecNode.getBlockNumber();

    epoch = await rollupCheatCodes.getEpoch();

    // Get block hash and archive for benchmarking getBlockByHash/getBlockByArchive
    const block = await aztecNode.getBlock(BlockNumber(blockNumber));
    blockArchive = block!.header.lastArchive.root;

    // Create a sample tx for benchmarking simulation/validation APIs
    logger.info('Creating sample tx for simulation/validation benchmarks...');
    sampleTx = await proveInteraction(wallet, tokenContract.methods.mint_to_public(ownerAddress, 1n), {
      from: ownerAddress,
    });
    logger.info('Sample tx created');

    logger.info(`Setup complete. Current block number: ${blockNumber}`);
  });

  async function buildBlocks() {
    const mintAmount = 100n;

    for (let block = 0; block < BLOCKS_TO_BUILD; block++) {
      const provenTx = await proveInteraction(wallet, tokenContract.methods.mint_to_public(ownerAddress, mintAmount), {
        from: ownerAddress,
      });

      const receipt = await provenTx.send({ wait: { timeout: 600 } });
      txHashes.push(receipt.txHash);
      logger.verbose(`Transaction ${receipt.txHash} included in block ${receipt.blockNumber}`);
      logger.info(`Block ${block + 1}/${BLOCKS_TO_BUILD} built`);
    }
  }

  function addResult(name: string, stats: TimingStats, unit = 'ms') {
    benchmarkResults.push({
      name: `node_rpc/${name}/avg`,
      unit,
      value: stats.avg,
      min: stats.min,
      max: stats.max,
      iterations: stats.count,
    });
  }

  describe('basic node info APIs', () => {
    it('benchmarks isReady', async () => {
      const { stats } = await benchmark('isReady', () => aztecNode.isReady());
      addResult('isReady', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getNodeInfo', async () => {
      const { stats } = await benchmark('getNodeInfo', () => aztecNode.getNodeInfo());
      addResult('getNodeInfo', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getNodeVersion', async () => {
      const { stats } = await benchmark('getNodeVersion', () => aztecNode.getNodeVersion());
      addResult('getNodeVersion', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getVersion', async () => {
      const { stats } = await benchmark('getVersion', () => aztecNode.getVersion());
      addResult('getVersion', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getChainId', async () => {
      const { stats } = await benchmark('getChainId', () => aztecNode.getChainId());
      addResult('getChainId', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getEncodedEnr', async () => {
      const { stats } = await benchmark('getEncodedEnr', () => aztecNode.getEncodedEnr());
      addResult('getEncodedEnr', stats);
      expect(stats.avg).toBeLessThan(1000);
    });
  });

  describe('contract and address APIs', () => {
    it('benchmarks getL1ContractAddresses', async () => {
      const { stats } = await benchmark('getL1ContractAddresses', () => aztecNode.getL1ContractAddresses());
      addResult('getL1ContractAddresses', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getProtocolContractAddresses', async () => {
      const { stats } = await benchmark('getProtocolContractAddresses', () => aztecNode.getProtocolContractAddresses());
      addResult('getProtocolContractAddresses', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getContract', async () => {
      const { stats } = await benchmark('getContract', () => aztecNode.getContract(contractAddress));
      addResult('getContract', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getContractClass', async () => {
      const { stats } = await benchmark('getContractClass', () => aztecNode.getContractClass(contractClassId));
      addResult('getContractClass', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('block APIs', () => {
    it('benchmarks getBlockNumber', async () => {
      const { stats } = await benchmark('getBlockNumber', () => aztecNode.getBlockNumber());
      addResult('getBlockNumber', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getCheckpointNumber', async () => {
      const { stats } = await benchmark('getCheckpointNumber', () => aztecNode.getCheckpointNumber());
      addResult('getCheckpointNumber', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getProvenBlockNumber', async () => {
      const { stats } = await benchmark('getProvenBlockNumber', () => aztecNode.getBlockNumber('proven'));
      addResult('getProvenBlockNumber', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getChainTips', async () => {
      const { stats } = await benchmark('getChainTips', () => aztecNode.getChainTips());
      addResult('getChainTips', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getBlock', async () => {
      const { stats } = await benchmark('getBlock', () => aztecNode.getBlock(BlockNumber(blockNumber)));
      addResult('getBlock', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getBlockData', async () => {
      const { stats } = await benchmark('getBlockData', () => aztecNode.getBlockData(BlockNumber(blockNumber)));
      addResult('getBlockData', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getBlocks (5 blocks)', async () => {
      const fromBlock = BlockNumber(Math.max(1, blockNumber - 4));
      const { stats } = await benchmark('getBlocks', () => aztecNode.getBlocks(fromBlock, 5));
      addResult('getBlocks_5', stats);
      expect(stats.avg).toBeLessThan(5000);
    });

    it('benchmarks getBlocks_checkpointed (5 blocks)', async () => {
      const fromBlock = BlockNumber(Math.max(1, blockNumber - 4));
      const { stats } = await benchmark('getBlocks_checkpointed', () =>
        aztecNode.getBlocks(fromBlock, 5, {
          includeL1PublishInfo: true,
          includeAttestations: true,
          onlyCheckpointed: true,
        }),
      );
      addResult('getBlocks_checkpointed_5', stats);
      expect(stats.avg).toBeLessThan(5000);
    });

    it('benchmarks getBlock by archive', async () => {
      const { stats } = await benchmark('getBlockByArchive', () =>
        aztecNode.getBlock({ archive: blockArchive }, { includeTransactions: true }),
      );
      addResult('getBlockByArchive', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getBlockData by archive', async () => {
      const { stats } = await benchmark('getBlockData_byArchive', () =>
        aztecNode.getBlockData({ archive: blockArchive }),
      );
      addResult('getBlockData_byArchive', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('world state APIs', () => {
    it('benchmarks getWorldStateSyncStatus', async () => {
      const { stats } = await benchmark('getWorldStateSyncStatus', () => aztecNode.getWorldStateSyncStatus());
      addResult('getWorldStateSyncStatus', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getPublicStorageAt', async () => {
      const slot = Fr.random();
      const { stats } = await benchmark('getPublicStorageAt', () =>
        aztecNode.getPublicStorageAt('latest', contractAddress, slot),
      );
      addResult('getPublicStorageAt', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('tree APIs', () => {
    it('benchmarks findLeavesIndexes (nullifier tree)', async () => {
      const leaves = [Fr.random()];
      const { stats } = await benchmark('findLeavesIndexes_nullifier', () =>
        aztecNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, leaves),
      );
      addResult('findLeavesIndexes_nullifier', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getNullifierMembershipWitness', async () => {
      const nullifier = Fr.random();
      const { stats } = await benchmark('getNullifierMembershipWitness', () =>
        aztecNode.getNullifierMembershipWitness('latest', nullifier),
      );
      addResult('getNullifierMembershipWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getLowNullifierMembershipWitness', async () => {
      const nullifier = Fr.random();
      const { stats } = await benchmark('getLowNullifierMembershipWitness', () =>
        aztecNode.getLowNullifierMembershipWitness('latest', nullifier),
      );
      addResult('getLowNullifierMembershipWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getPublicDataWitness', async () => {
      const slot = Fr.random();
      const { stats } = await benchmark('getPublicDataWitness', () => aztecNode.getPublicDataWitness('latest', slot));
      addResult('getPublicDataWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getBlockHashMembershipWitness', async () => {
      const blockHash = BlockHash.random();
      const { stats } = await benchmark('getBlockHashMembershipWitness', () =>
        aztecNode.getBlockHashMembershipWitness('latest', blockHash),
      );
      addResult('getBlockHashMembershipWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getNoteHashMembershipWitness', async () => {
      const noteHash = Fr.random();
      const { stats } = await benchmark('getNoteHashMembershipWitness', () =>
        aztecNode.getNoteHashMembershipWitness('latest', noteHash),
      );
      addResult('getNoteHashMembershipWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getL1ToL2MessageMembershipWitness', async () => {
      const l1ToL2Message = Fr.random();
      const { stats } = await benchmark('getL1ToL2MessageMembershipWitness', () =>
        aztecNode.getL1ToL2MessageMembershipWitness('latest', l1ToL2Message),
      );
      addResult('getL1ToL2MessageMembershipWitness', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('message APIs', () => {
    it('benchmarks getL1ToL2MessageCheckpoint', async () => {
      const l1ToL2Message = Fr.random();
      const { stats } = await benchmark('getL1ToL2MessageCheckpoint', () =>
        aztecNode.getL1ToL2MessageCheckpoint(l1ToL2Message),
      );
      addResult('getL1ToL2MessageCheckpoint', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getL2ToL1Messages', async () => {
      const { stats } = await benchmark('getL2ToL1Messages', () => aztecNode.getL2ToL1Messages(epoch));
      addResult('getL2ToL1Messages', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('transaction APIs', () => {
    it('benchmarks getTxReceipt', async () => {
      if (txHashes.length === 0) {
        logger.warn('No tx hashes available for getTxReceipt benchmark');
        return;
      }
      const { stats } = await benchmark('getTxReceipt', () => aztecNode.getTxReceipt(txHashes[0]));
      addResult('getTxReceipt', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getTxEffect', async () => {
      if (txHashes.length === 0) {
        logger.warn('No tx hashes available for getTxEffect benchmark');
        return;
      }
      const { stats } = await benchmark('getTxEffect', () => aztecNode.getTxEffect(txHashes[0]));
      addResult('getTxEffect', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getPendingTxs', async () => {
      const { stats } = await benchmark('getPendingTxs', () => aztecNode.getPendingTxs());
      addResult('getPendingTxs', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getPendingTxCount', async () => {
      const { stats } = await benchmark('getPendingTxCount', () => aztecNode.getPendingTxCount());
      addResult('getPendingTxCount', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getTxByHash', async () => {
      if (txHashes.length === 0) {
        logger.warn('No tx hashes available for getTxByHash benchmark');
        return;
      }
      const { stats } = await benchmark('getTxByHash', () => aztecNode.getTxByHash(txHashes[0]));
      addResult('getTxByHash', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getTxsByHash', async () => {
      if (txHashes.length === 0) {
        logger.warn('No tx hashes available for getTxsByHash benchmark');
        return;
      }
      const { stats } = await benchmark('getTxsByHash', () => aztecNode.getTxsByHash(txHashes));
      addResult('getTxsByHash', stats);
      expect(stats.avg).toBeLessThan(3000);
    });
  });

  describe('write and simulation APIs', () => {
    it('benchmarks sendTx', async () => {
      // Create fresh txs for each iteration since each can only be sent once
      const timings: number[] = [];
      for (let i = 0; i < BENCHMARK_ITERATIONS_SLOW; i++) {
        const tx = await proveInteraction(wallet, tokenContract.methods.mint_to_public(ownerAddress, 1n), {
          from: ownerAddress,
        });
        const timer = new Timer();
        await aztecNode.sendTx(tx);
        timings.push(timer.ms());
      }
      const stats = calculateStats(timings);
      addResult('sendTx', stats);
      expect(stats.avg).toBeLessThan(5000);
    });

    it('benchmarks registerContractFunctionSignatures', async () => {
      const signatures = ['transfer(Field,Field,Field)', 'mint_to_public(Field,Field)'];
      const { stats } = await benchmark('registerContractFunctionSignatures', () =>
        aztecNode.registerContractFunctionSignatures(signatures),
      );
      addResult('registerContractFunctionSignatures', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks simulatePublicCalls', async () => {
      const { stats } = await benchmark(
        'simulatePublicCalls',
        () => aztecNode.simulatePublicCalls(sampleTx, true), // skipFeeEnforcement = true
        BENCHMARK_ITERATIONS_SLOW,
      );
      addResult('simulatePublicCalls', stats);
      expect(stats.avg).toBeLessThan(10000); // Simulation can take longer
    });

    it('benchmarks isValidTx', async () => {
      const { stats } = await benchmark('isValidTx', () =>
        aztecNode.isValidTx(sampleTx, { isSimulation: true, skipFeeEnforcement: true }),
      );
      addResult('isValidTx', stats);
      expect(stats.avg).toBeLessThan(5000);
    });
  });

  describe('fee APIs', () => {
    it('benchmarks getCurrentMinFees', async () => {
      const { stats } = await benchmark('getCurrentMinFees', () => aztecNode.getCurrentMinFees());
      addResult('getCurrentMinFees', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getMaxPriorityFees', async () => {
      const { stats } = await benchmark('getMaxPriorityFees', () => aztecNode.getMaxPriorityFees());
      addResult('getMaxPriorityFees', stats);
      expect(stats.avg).toBeLessThan(1000);
    });
  });

  describe('fee APIs with injected L1 latency', () => {
    // Warm the snapshot and establish a same-run local-RPC baseline before injecting L1 latency, so the fee
    // warm-path p95 is compared against a call that never touches L1 under identical process conditions.
    async function measureWarm(fn: () => Promise<unknown>, iterations: number): Promise<number[]> {
      const timings: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const timer = new Timer();
        await fn();
        timings.push(timer.ms());
      }
      return timings;
    }

    it('serves warm getPredictedMinFees with zero fee-path L1 requests and near-local latency (sequential)', async () => {
      // Warm the snapshot with zero delay, then inject latency so any L1 round trip would dominate.
      await aztecNode.getPredictedMinFees(ManaUsageEstimate.Limit);
      latencyProxy.setDelayMs(INJECTED_L1_LATENCY_MS);
      try {
        const baseline = await measureWarm(() => aztecNode.getBlockNumber(), 20);
        const statsBefore = aztecNodeService.getFeeSnapshotStats();
        const feeTimings = await measureWarm(() => aztecNode.getPredictedMinFees(ManaUsageEstimate.Limit), 20);
        const statsAfter = aztecNodeService.getFeeSnapshotStats();

        const baselineP95 = percentile(baseline, 95);
        const feeP95 = percentile(feeTimings, 95);
        addResult('getPredictedMinFees_warm_seq_p95', calculateStats(feeTimings));
        logger.info('Warm getPredictedMinFees (sequential) with 100ms L1 latency', {
          feeP95,
          baselineP95,
          readTriggeredRefreshesDelta:
            (statsAfter?.readTriggeredRefreshes ?? 0) - (statsBefore?.readTriggeredRefreshes ?? 0),
        });

        // Gated: warm reads must trigger no refresh (zero fee-path L1 requests) and stay near the local baseline.
        if (statsBefore && statsAfter) {
          expect(statsAfter.readTriggeredRefreshes).toBe(statsBefore.readTriggeredRefreshes);
        }
        expect(feeP95).toBeLessThan(baselineP95 + INJECTED_L1_LATENCY_MS);
      } finally {
        latencyProxy.setDelayMs(0);
      }
    });

    it('serves warm getPredictedMinFees with zero fee-path L1 requests and near-local latency (concurrent)', async () => {
      await aztecNode.getPredictedMinFees(ManaUsageEstimate.Limit);
      latencyProxy.setDelayMs(INJECTED_L1_LATENCY_MS);
      try {
        const statsBefore = aztecNodeService.getFeeSnapshotStats();
        const timer = new Timer();
        await Promise.all(Array.from({ length: 20 }, () => aztecNode.getPredictedMinFees(ManaUsageEstimate.Limit)));
        const totalMs = timer.ms();
        const statsAfter = aztecNodeService.getFeeSnapshotStats();

        logger.info('Warm getPredictedMinFees (20 concurrent) with 100ms L1 latency', {
          totalMs,
          readTriggeredRefreshesDelta:
            (statsAfter?.readTriggeredRefreshes ?? 0) - (statsBefore?.readTriggeredRefreshes ?? 0),
        });
        addResult('getPredictedMinFees_warm_concurrent_total', {
          avg: totalMs,
          min: totalMs,
          max: totalMs,
          total: totalMs,
          count: 20,
        });

        if (statsBefore && statsAfter) {
          expect(statsAfter.readTriggeredRefreshes).toBe(statsBefore.readTriggeredRefreshes);
        }
        // 20 concurrent warm reads should complete well within a single injected L1 round trip.
        expect(totalMs).toBeLessThan(INJECTED_L1_LATENCY_MS);
      } finally {
        latencyProxy.setDelayMs(0);
      }
    });

    it('reports refresh cost and the first call after a new L1 block (non-gating)', async () => {
      latencyProxy.setDelayMs(INJECTED_L1_LATENCY_MS);
      try {
        latencyProxy.resetCounts();
        const before = aztecNodeService.getFeeSnapshotStats();
        // Advance the chain to force an archiver identity change and observe the boundary refresh cost.
        await rollupCheatCodes.advanceSlots(1);
        const timer = new Timer();
        await aztecNode.getPredictedMinFees(ManaUsageEstimate.Limit);
        const firstCallMs = timer.ms();
        const after = aztecNodeService.getFeeSnapshotStats();
        logger.info('First getPredictedMinFees after advancing the chain (reported)', {
          firstCallMs,
          refreshesDelta: (after?.refreshes ?? 0) - (before?.refreshes ?? 0),
          proxyEthCalls: latencyProxy.getRequestCount('eth_call'),
        });
        addResult('getPredictedMinFees_boundary_first_call', {
          avg: firstCallMs,
          min: firstCallMs,
          max: firstCallMs,
          total: firstCallMs,
          count: 1,
        });
      } finally {
        latencyProxy.setDelayMs(0);
      }
    });
  });

  describe('log APIs', () => {
    it('benchmarks getPrivateLogsByTags', async () => {
      const tags = [SiloedTag.random()];
      const { stats } = await benchmark('getPrivateLogsByTags', () => aztecNode.getPrivateLogsByTags({ tags }));
      addResult('getPrivateLogsByTags', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getPublicLogsByTags', async () => {
      const tags = [Tag.random()];
      const { stats } = await benchmark('getPublicLogsByTags', () =>
        aztecNode.getPublicLogsByTags({ contractAddress, tags }),
      );
      addResult('getPublicLogsByTags', stats);
      expect(stats.avg).toBeLessThan(3000);
    });
  });

  describe('validator APIs', () => {
    it('benchmarks getValidatorsStats', async () => {
      const { stats } = await benchmark('getValidatorsStats', () => aztecNode.getValidatorsStats());
      addResult('getValidatorsStats', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getValidatorStats', async () => {
      // Use a dummy address - the API should handle non-existent validators gracefully
      const dummyValidator = EthAddress.random();
      const { stats } = await benchmark('getValidatorStats', () => aztecNode.getValidatorStats(dummyValidator));
      addResult('getValidatorStats', stats);
      expect(stats.avg).toBeLessThan(2000);
    });
  });

  describe('misc APIs', () => {
    it('benchmarks getAllowedPublicSetup', async () => {
      const { stats } = await benchmark('getAllowedPublicSetup', () => aztecNode.getAllowedPublicSetup());
      addResult('getAllowedPublicSetup', stats);
      expect(stats.avg).toBeLessThan(1000);
    });
  });
});
