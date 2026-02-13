/**
 * Node RPC API Performance Test
 *
 * This test:
 * 1. Sets up a local Aztec node
 * 2. Builds a few blocks by sending transactions
 * 3. Benchmarks all node RPC API methods
 */
import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { RollupCheatCodes } from '@aztec/ethereum/test';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Timer } from '@aztec/foundation/timer';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { BlockHash } from '@aztec/stdlib/block';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import 'jest-extended';
import * as path from 'path';

import { setup } from '../fixtures/utils.js';
import type { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';

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

describe('e2e_node_rpc_perf', () => {
  jest.setTimeout(10 * 60 * 1000); // 10 minutes

  let logger: Logger;
  let aztecNode: AztecNode;
  let wallet: TestWallet;
  let ownerAddress: AztecAddress;
  let rollupCheatCodes: RollupCheatCodes;
  let teardown: () => Promise<void>;
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
  });

  beforeAll(async () => {
    ({
      teardown,
      logger,
      aztecNode,
      wallet,
      accounts: [ownerAddress],
      cheatCodes: { rollup: rollupCheatCodes },
    } = await setup(1, {
      archiverPollingIntervalMS: 200,
      sequencerPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      minTxsPerBlock: 1,
    }));

    logger.info('Deploying token contract...');
    tokenContract = await TokenContract.deploy(wallet, ownerAddress, 'TestToken', 'TST', 18n).send({
      from: ownerAddress,
    });
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

    it('benchmarks getProvenBlockNumber', async () => {
      const { stats } = await benchmark('getProvenBlockNumber', () => aztecNode.getProvenBlockNumber());
      addResult('getProvenBlockNumber', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getL2Tips', async () => {
      const { stats } = await benchmark('getL2Tips', () => aztecNode.getL2Tips());
      addResult('getL2Tips', stats);
      expect(stats.avg).toBeLessThan(1000);
    });

    it('benchmarks getBlock', async () => {
      const { stats } = await benchmark('getBlock', () => aztecNode.getBlock(BlockNumber(blockNumber)));
      addResult('getBlock', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getBlockHeader', async () => {
      const { stats } = await benchmark('getBlockHeader', () => aztecNode.getBlockHeader(BlockNumber(blockNumber)));
      addResult('getBlockHeader', stats);
      expect(stats.avg).toBeLessThan(2000);
    });

    it('benchmarks getBlocks (5 blocks)', async () => {
      const fromBlock = BlockNumber(Math.max(1, blockNumber - 4));
      const { stats } = await benchmark('getBlocks', () => aztecNode.getBlocks(fromBlock, 5));
      addResult('getBlocks_5', stats);
      expect(stats.avg).toBeLessThan(5000);
    });

    it('benchmarks getCheckpointedBlocks (5 blocks)', async () => {
      const fromBlock = BlockNumber(Math.max(1, blockNumber - 4));
      const { stats } = await benchmark('getCheckpointedBlocks', () => aztecNode.getCheckpointedBlocks(fromBlock, 5));
      addResult('getCheckpointedBlocks_5', stats);
      expect(stats.avg).toBeLessThan(5000);
    });

    it('benchmarks getBlockByArchive', async () => {
      const { stats } = await benchmark('getBlockByArchive', () => aztecNode.getBlockByArchive(blockArchive));
      addResult('getBlockByArchive', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getBlockHeaderByArchive', async () => {
      const { stats } = await benchmark('getBlockHeaderByArchive', () =>
        aztecNode.getBlockHeaderByArchive(blockArchive),
      );
      addResult('getBlockHeaderByArchive', stats);
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
    it('benchmarks getL1ToL2MessageBlock', async () => {
      const l1ToL2Message = Fr.random();
      const { stats } = await benchmark('getL1ToL2MessageBlock', () => aztecNode.getL1ToL2MessageBlock(l1ToL2Message));
      addResult('getL1ToL2MessageBlock', stats);
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

  describe('log APIs', () => {
    it('benchmarks getPublicLogs', async () => {
      const { stats } = await benchmark('getPublicLogs', () => aztecNode.getPublicLogs({}));
      addResult('getPublicLogs', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getContractClassLogs', async () => {
      const { stats } = await benchmark('getContractClassLogs', () => aztecNode.getContractClassLogs({}));
      addResult('getContractClassLogs', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getPrivateLogsByTags', async () => {
      const tags = [new SiloedTag(Fr.random())];
      const { stats } = await benchmark('getPrivateLogsByTags', () => aztecNode.getPrivateLogsByTags(tags));
      addResult('getPrivateLogsByTags', stats);
      expect(stats.avg).toBeLessThan(3000);
    });

    it('benchmarks getPublicLogsByTagsFromContract', async () => {
      const tags = [new Tag(Fr.random())];
      const { stats } = await benchmark('getPublicLogsByTagsFromContract', () =>
        aztecNode.getPublicLogsByTagsFromContract(contractAddress, tags),
      );
      addResult('getPublicLogsByTagsFromContract', stats);
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
