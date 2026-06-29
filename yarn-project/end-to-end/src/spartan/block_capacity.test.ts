import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type ContractFunctionInteraction, NO_WAIT, toSendOptions } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient, waitForTx } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { asyncPool } from '@aztec/foundation/async-pool';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { GasFees } from '@aztec/stdlib/gas';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

import { LARGE_MIN_FEE_PADDING, getPaddedMaxFeesPerGas } from '../fixtures/fixtures.js';
import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import type { WorkerWallet } from '../test-wallet/worker_wallet.js';
import { type WorkerWalletWrapper, createWorkerWalletClient } from './setup_test_wallets.js';
import {
  fetchBlockBuiltLogs,
  getExternalIP,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';

const config = setupEnvironment(process.env);
const txRealProofs = config.REAL_VERIFIER || config.DEBUG_FORCE_TX_PROOF_VERIFICATION;

const BENCH_TESTS = [
  ['noop', 100],
  ['noop_pub', 100],
  ['emit_nullifiers', 100],
  ['emit_note_hashes', 100],
  ['emit_l2_to_l1_msgs', 100],
  ['emit_private_logs', 88], // we run out of blob space
  ['emit_contract_class_log', 8],
] as const;

const TOKEN_TESTS = [
  // intentional comment - for file fomatting
  ['transfer_in_public', 100],
] as const;

const maxTxs = Math.max(...[...BENCH_TESTS, ...TOKEN_TESTS].map(t => t[1]));
const NUM_WALLETS = txRealProofs ? Math.min(10, maxTxs) : 1;

// Block capacity benchmark against a live k8s deployment. Fills blocks with up to 100 transactions per
// type (noop, nullifier emission, note emission, etc.) and measures inclusion; outputs benchmark JSON.
describe('block capacity benchmark', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const logger = createLogger('e2e:spartan-test:block-capacity');

  let testWallets: WorkerWalletWrapper[];
  let wallets: WorkerWallet[];
  let accountAddresses: AztecAddress[];
  let aztecNode: AztecNode;
  let originalSequencerConfig: Awaited<ReturnType<typeof getSequencersConfig>> | undefined;
  const benchmarkData: Array<{ name: string; unit: string; value: number }> = [];

  beforeAll(async () => {
    logger.info('Setting up block capacity benchmark', {
      numWallets: NUM_WALLETS,
      txRealProofs,
      namespace: config.NAMESPACE,
    });

    await updateSequencersConfig(config, { minTxsPerBlock: 0 });

    const rpcIP = await getExternalIP(config.NAMESPACE, 'rpc-aztec-node');
    const rpcUrl = `http://${rpcIP}:8080`;
    aztecNode = createAztecNodeClient(rpcUrl);

    // Wait for node to be ready
    await retryUntil(async () => await aztecNode.isReady(), 'node ready', 120, 1);
    logger.info('Node is ready');

    // Save original sequencer config for restoration
    originalSequencerConfig = await getSequencersConfig(config);
    logger.info('Saved original sequencer config', {
      minTxsPerBlock: originalSequencerConfig[0]?.minTxsPerBlock,
    });

    // Create WorkerWallets in parallel
    logger.info(`Creating ${NUM_WALLETS} worker wallet(s)...`);
    testWallets = await Promise.all(
      Array.from({ length: NUM_WALLETS }, (_, i) => {
        logger.info(`Creating wallet ${i + 1}/${NUM_WALLETS}`);
        return createWorkerWalletClient(rpcUrl, txRealProofs, logger);
      }),
    );
    wallets = testWallets.map(tw => tw.wallet);

    // Register FPC and create/deploy accounts in parallel
    const fpcAddress = await getSponsoredFPCAddress();
    const sponsor = new SponsoredFeePaymentMethod(fpcAddress);
    accountAddresses = await Promise.all(
      wallets.map(async wallet => {
        const secret = Fr.random();
        const salt = Fr.random();
        const address = await wallet.registerAccount(secret, salt);
        await registerSponsoredFPC(wallet);
        const manager = await AccountManager.create(
          wallet,
          secret,
          new SchnorrAccountContract(deriveSigningKey(secret)),
          { salt },
        );
        const deployMethod = await manager.getDeployMethod();
        await deployMethod.send({
          from: NO_FROM,
          fee: { paymentMethod: sponsor },
          wait: { timeout: 2400 },
        });
        logger.info(`Account deployed at ${address}`);
        return address;
      }),
    );
  });

  afterAll(async () => {
    // Write benchmark output if configured
    if (process.env.BENCH_OUTPUT && benchmarkData.length > 0) {
      const scenario = process.env.BENCH_SCENARIO?.trim();
      const finalData = scenario
        ? benchmarkData.map(e => ({ ...e, name: `scenario/${scenario}/${e.name}` }))
        : benchmarkData;
      await mkdir(dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(finalData));
      logger.info('Wrote benchmark output', { path: process.env.BENCH_OUTPUT, entries: finalData.length });
    }

    // Restore original sequencer config
    if (originalSequencerConfig?.[0]) {
      logger.info('Restoring original sequencer config');
      await updateSequencersConfig(config, originalSequencerConfig[0]);
    }

    if (testWallets) {
      for (const tw of testWallets) {
        await tw.cleanup();
      }
    }

    logger.info('Cleanup complete');
  });

  /** Creates and proves a single tx from a contract interaction. */
  async function createProvableTx(
    wallet: WorkerWallet,
    accountAddress: AztecAddress,
    interaction: ContractFunctionInteraction,
  ): Promise<Tx> {
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const options = {
      from: accountAddress,
      fee: { paymentMethod: sponsor, gasSettings: { maxPriorityFeesPerGas: GasFees.empty() } },
    };
    const execPayload = await interaction.request(options);
    return wallet.proveTx(execPayload, toSendOptions(options));
  }

  /** Pre-proves TX_COUNT txs, either in parallel batches or by cloning a prototype. */
  async function proveOrCloneTxs(
    txCount: number,
    createPrototypeFn: (wallet: WorkerWallet, accountAddress: AztecAddress) => Promise<Tx>,
  ): Promise<Tx[]> {
    const txs: Tx[] = [];
    if (txRealProofs) {
      for (let i = 0; i < txCount; i += NUM_WALLETS) {
        const batchSize = Math.min(NUM_WALLETS, txCount - txs.length);
        const batchTxs = await Promise.all(times(batchSize, j => createPrototypeFn(wallets[j], accountAddresses[j])));
        txs.push(...batchTxs);
        logger.info(`Proved ${txs.length}/${txCount} txs`);
      }
    } else {
      const prototypeTx = await createPrototypeFn(wallets[0], accountAddresses[0]);
      logger.info('Prototype tx proved, cloning...');
      for (let i = 0; i < txCount; i++) {
        txs.push(await cloneTx(prototypeTx, aztecNode));
        if ((i + 1) % 10 === 0 || i === txCount - 1) {
          logger.info(`Cloned ${i + 1}/${txCount} txs`);
        }
      }
    }
    return txs;
  }

  /** Floods the mempool with pre-proven txs and measures block capacity. */
  async function floodAndMeasure(
    label: string,
    provenTxs: Tx[],
  ): Promise<{ blockTxCounts: { blockNumber: number; txCount: number }[]; enabledAt: string }> {
    const epochDurationSec = 2 * config.AZTEC_EPOCH_DURATION * config.AZTEC_SLOT_DURATION; // wait for up to two epochs (these are shorter epochs than standard)
    const txCount = provenTxs.length;

    // 0. wait for the mempool to clear
    await retryUntil(
      async () => {
        const pendingTxs = await aztecNode.getPendingTxCount();

        if (pendingTxs > 0) {
          logger.info(`Waiting for mempool to clear before sending test txs: ${pendingTxs} pending txs left.`);
          return false;
        } else {
          return true;
        }
      },
      'clear pending txs',
      epochDurationSec,
      1,
    );

    // 1. Disable block building by setting minTxsPerBlock extremely high
    logger.info(`[${label}] Disabling block building`);
    await updateSequencersConfig(config, { minTxsPerBlock: 999_999_999 });
    await retryUntil(
      async () => {
        const configs = await getSequencersConfig(config);
        return configs.every(c => c.minTxsPerBlock === 999_999_999);
      },
      'disable block building',
      60,
      1,
    );
    logger.info(`[${label}] Block building disabled`);

    const blockBeforeFlood = await aztecNode.getBlockNumber();
    logger.info(`[${label}] Block number before flood`, { blockBeforeFlood });

    // 2. Send all pre-proven txs to mempool
    logger.info(`[${label}] Sending ${provenTxs.length} pre-proven txs to mempool`);
    const sendStartMs = Date.now();

    let sentCount = 0;
    const txSize = provenTxs[0].toBuffer().length;
    logger.info(`Tx size: ${(txSize / 1024 / 1024).toFixed(2)}MB (${txSize} bytes)`);
    // dynamically adjust how many txs we can send to stay below 1MB
    await asyncPool(Math.max(1, Math.floor((0.5 * 1024 * 1024) / txSize)), provenTxs, async tx => {
      await aztecNode.sendTx(tx);
      sentCount++;
      if (sentCount % 10 === 0 || sentCount === provenTxs.length) {
        logger.info(`[${label}] Sent ${sentCount}/${provenTxs.length} txs`);
      }
    });

    const sendDurationMs = Date.now() - sendStartMs;
    logger.info(`[${label}] All ${provenTxs.length} txs sent to mempool`, { sendDurationMs });

    // 3. Re-enable block building
    const enabledAt = new Date().toISOString();
    logger.info(`[${label}] Re-enabling block building`);
    await updateSequencersConfig(config, { minTxsPerBlock: 1 });
    await retryUntil(
      async () => {
        const configs = await getSequencersConfig(config);
        return configs.every(c => c.minTxsPerBlock === 1);
      },
      'enable block building',
      60,
      1,
    );
    logger.info(`[${label}] Block building re-enabled`);

    // 4. Wait for blocks and observe inclusion
    let totalTxsMined = 0;
    const blockTxCounts: { blockNumber: number; txCount: number }[] = [];

    await retryUntil(
      async () => {
        const currentBlock = await aztecNode.getBlockNumber();
        for (let bn = blockBeforeFlood + 1; bn <= currentBlock; bn++) {
          if (blockTxCounts.some(b => b.blockNumber === bn)) {
            continue;
          }
          const block = await aztecNode.getBlock(BlockNumber(bn), { includeTransactions: true });
          if (block) {
            const txCount = block.body.txEffects.length;
            blockTxCounts.push({ blockNumber: bn, txCount });
            totalTxsMined += txCount;
            logger.info(`[${label}] Block ${bn}: ${txCount} txs (total mined: ${totalTxsMined}/${txCount})`);
          }
        }
        return totalTxsMined >= txCount;
      },
      'all txs mined',
      epochDurationSec,
      1,
    );

    // Log summary
    logger.info(`=== Block Capacity Benchmark Results (${label}) ===`);
    logger.info(`Total txs sent: ${txCount}`);
    logger.info(`Total txs mined: ${totalTxsMined}`);
    logger.info(`Blocks produced: ${blockTxCounts.length}`);
    for (const { blockNumber, txCount } of blockTxCounts) {
      logger.info(`  Block ${blockNumber}: ${txCount} txs`);
    }

    if (blockTxCounts.length > 0) {
      const maxTxsInBlock = Math.max(...blockTxCounts.map(b => b.txCount));
      const avgTxsPerBlock = totalTxsMined / blockTxCounts.length;
      logger.info(`Max txs in a single block: ${maxTxsInBlock}`);
      logger.info(`Avg txs per block: ${avgTxsPerBlock.toFixed(1)}`);
    }

    expect(totalTxsMined).toBeGreaterThanOrEqual(txCount);

    return { blockTxCounts, enabledAt };
  }

  /** Fetches block-built stats from sequencer logs and records benchmark metrics for each block. */
  async function recordBlockBuiltMetrics(
    label: string,
    blockTxCounts: { blockNumber: number; txCount: number }[],
    enabledAt: string,
  ): Promise<void> {
    const blockNumbers = new Set(blockTxCounts.map(b => b.blockNumber));
    const entries = await fetchBlockBuiltLogs(config.NAMESPACE, enabledAt, blockNumbers, logger);

    if (entries.length === 0) {
      logger.warn(`[${label}] No block-built log entries found, skipping benchmark metrics`);
      return;
    }

    // Record metrics for each block (entries are sorted by blockNumber ascending)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const prefix = `block_capacity/${label}/block_${i}`;
      benchmarkData.push(
        { name: `${prefix}/duration`, unit: 'ms', value: entry.duration },
        { name: `${prefix}/tx_count`, unit: 'count', value: entry.txCount },
        { name: `${prefix}/mana_per_sec`, unit: 'mana/s', value: entry.manaPerSec },
        { name: `${prefix}/public_process_duration`, unit: 'ms', value: entry.publicProcessDuration },
        { name: `${prefix}/private_log_count`, unit: 'count', value: entry.privateLogCount },
        { name: `${prefix}/public_log_count`, unit: 'count', value: entry.publicLogCount },
        { name: `${prefix}/contract_class_log_count`, unit: 'count', value: entry.contractClassLogCount },
        { name: `${prefix}/contract_class_log_size`, unit: 'fields', value: entry.contractClassLogSize },
      );
      logger.info(`[${label}] Recorded benchmark metrics from block ${entry.blockNumber} (index ${i})`, entry);
    }

    benchmarkData.push({
      name: `block_capacity/${label}/blocks_produced`,
      unit: 'count',
      value: entries.length,
    });
  }

  describe('Benchmark contract', () => {
    let benchmarkContract: BenchmarkingContract;

    beforeAll(async () => {
      const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
      // Deploy BenchmarkingContract using the first wallet
      logger.info('Deploying benchmark contract...');
      ({ contract: benchmarkContract } = await BenchmarkingContract.deploy(wallets[0]).send({
        from: accountAddresses[0],
        fee: { paymentMethod: sponsor },
      }));
      logger.info('BenchmarkingContract deployed', { address: benchmarkContract.address.toString() });

      // Register benchmark contract with all other wallets
      const benchMetadata = await wallets[0].getContractMetadata(benchmarkContract.address);
      await Promise.all(
        wallets.slice(1).map(wallet => wallet.registerContract(benchMetadata.instance!, BenchmarkingContract.artifact)),
      );
      logger.info('Benchmark contract registered with all wallets');
    });
    it.each(BENCH_TESTS)('measures block capacity with %s', async (fnName, txCount) => {
      logger.info(`Pre-proving ${txCount} ${fnName} txs...`);
      const txs = await proveOrCloneTxs(txCount, (wallet, addr) => {
        const contract = BenchmarkingContract.at(benchmarkContract.address, wallet);
        return createProvableTx(wallet, addr, contract.methods[fnName]());
      });
      logger.info(`All ${txCount} ${fnName} txs pre-proven`);
      const { blockTxCounts, enabledAt } = await floodAndMeasure(fnName, txs);
      await recordBlockBuiltMetrics(fnName, blockTxCounts, enabledAt);
    });
  });

  describe('Token contract', () => {
    let tokenContract: TokenContract;

    beforeAll(async () => {
      const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
      // Deploy TokenContract using the first wallet
      logger.info('Deploying token contract...');
      ({ contract: tokenContract } = await TokenContract.deploy(
        wallets[0],
        accountAddresses[0],
        'USDC',
        'USD',
        18n,
      ).send({
        from: accountAddresses[0],
        fee: { paymentMethod: sponsor },
        wait: { timeout: 600 },
      }));
      logger.info('TokenContract deployed', { address: tokenContract.address.toString() });

      // Register token contract with all other wallets
      const tokenMetadata = await wallets[0].getContractMetadata(tokenContract.address);
      await Promise.all(
        wallets.slice(1).map(wallet => wallet.registerContract(tokenMetadata.instance!, TokenContract.artifact)),
      );
      logger.info('Token contract registered with all wallets');

      // Mint tokens publicly to each account (enough for TX_COUNT transfers).
      // Send sequentially to avoid PXE concurrency issues, then wait in parallel.
      logger.info(`Minting 1e18 tokens to each account...`);
      const mintTxHashes = [];
      for (const acc of accountAddresses) {
        const { txHash } = await TokenContract.at(tokenContract.address, wallets[0])
          .methods.mint_to_public(acc, 10n ** 18n)
          .send({ from: accountAddresses[0], fee: { paymentMethod: sponsor }, wait: NO_WAIT });
        mintTxHashes.push(txHash);
      }
      await Promise.all(mintTxHashes.map(txHash => waitForTx(aztecNode, txHash, { timeout: 600 })));
      logger.info('Minting complete');
    });

    it.each(TOKEN_TESTS)('measures block capacity with public token transfers', async (fnName, txCount) => {
      // Each account transfers 1 token to a "sink" address.
      // Note: For the clone path, all cloned txs share the same sender/recipient/amount.
      // Public state conflicts may cause some cloned txs to fail during execution.
      const recipient = accountAddresses[0];
      logger.info(`Pre-proving ${txCount} ${fnName} txs...`);
      const txs = await proveOrCloneTxs(txCount, (wallet, addr) => {
        const token = TokenContract.at(tokenContract.address, wallet);
        return createProvableTx(wallet, addr, token.methods[fnName](addr, recipient, 1n, 0));
      });
      logger.info(`All ${txCount} ${fnName} txs pre-proven`);
      const { blockTxCounts, enabledAt } = await floodAndMeasure(fnName, txs);
      await recordBlockBuiltMetrics(fnName, blockTxCounts, enabledAt);
    });
  });
});

/** Clones a proven tx, randomizing nullifiers and updating fees so each clone is unique. */
async function cloneTx(tx: Tx, aztecNode: AztecNode): Promise<Tx> {
  const clonedTx = Tx.clone(tx, false);

  // Fetch current minimum fees and apply 15x buffer to cover fee decay between blocks
  const paddedFees = await getPaddedMaxFeesPerGas(aztecNode, LARGE_MIN_FEE_PADDING);

  // Update gas settings with current fees
  (clonedTx.data.constants.txContext.gasSettings as any).maxFeesPerGas = paddedFees;

  // Randomize nullifiers to avoid conflicts
  if (clonedTx.data.forRollup) {
    for (let i = 0; i < clonedTx.data.forRollup.end.nullifiers.length; i++) {
      if (clonedTx.data.forRollup.end.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forRollup.end.nullifiers[i] = Fr.random();
    }
  } else if (clonedTx.data.forPublic) {
    for (let i = 0; i < clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers.length; i++) {
      if (clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i] = Fr.random();
    }
  }

  await clonedTx.recomputeHash();
  return clonedTx;
}
