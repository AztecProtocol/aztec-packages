import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { type ContractFunctionInteraction, NO_WAIT, toSendOptions } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient, waitForTx } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { asyncPool } from '@aztec/foundation/async-pool';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { GasFees } from '@aztec/stdlib/gas';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import type { WorkerWallet } from '../test-wallet/worker_wallet.js';
import { type WorkerWalletWrapper, createWorkerWalletClient } from './setup_test_wallets.js';
import { getExternalIP, getSequencersConfig, setupEnvironment, updateSequencersConfig } from './utils.js';

const config = setupEnvironment(process.env);

const NUM_WALLETS = config.REAL_VERIFIER || config.DEBUG_FORCE_TX_PROOF_VERIFICATION ? 10 : 1;
const TX_COUNT = parseInt(process.env.TX_COUNT ?? '100', 10);

describe('block capacity benchmark', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const logger = createLogger('e2e:spartan-test:block-capacity');

  let testWallets: WorkerWalletWrapper[];
  let wallets: WorkerWallet[];
  let accountAddresses: AztecAddress[];
  let aztecNode: AztecNode;
  let benchmarkContract: BenchmarkingContract;
  let tokenContract: TokenContract;
  let originalSequencerConfig: Awaited<ReturnType<typeof getSequencersConfig>> | undefined;

  beforeAll(async () => {
    logger.info('Setting up block capacity benchmark', {
      txCount: TX_COUNT,
      numWallets: NUM_WALLETS,
      realVerifier: config.REAL_VERIFIER,
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
        return createWorkerWalletClient(
          rpcUrl,
          config.REAL_VERIFIER || config.DEBUG_FORCE_TX_PROOF_VERIFICATION,
          logger,
        );
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
          salt,
        );
        const deployMethod = await manager.getDeployMethod();
        await deployMethod.send({
          from: AztecAddress.ZERO,
          fee: { paymentMethod: sponsor },
          wait: { timeout: 2400 },
        });
        logger.info(`Account deployed at ${address}`);
        return address;
      }),
    );

    // Deploy BenchmarkingContract using the first wallet
    logger.info('Deploying benchmark contract...');
    benchmarkContract = await BenchmarkingContract.deploy(wallets[0]).send({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
    });
    logger.info('BenchmarkingContract deployed', { address: benchmarkContract.address.toString() });

    // Register benchmark contract with all other wallets
    const benchMetadata = await wallets[0].getContractMetadata(benchmarkContract.address);
    await Promise.all(
      wallets.slice(1).map(wallet => wallet.registerContract(benchMetadata.instance!, BenchmarkingContract.artifact)),
    );
    logger.info('Benchmark contract registered with all wallets');

    // Deploy TokenContract using the first wallet
    logger.info('Deploying token contract...');
    tokenContract = await TokenContract.deploy(wallets[0], accountAddresses[0], 'USDC', 'USD', 18n).send({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
      wait: { timeout: 600 },
    });
    logger.info('TokenContract deployed', { address: tokenContract.address.toString() });

    // Register token contract with all other wallets
    const tokenMetadata = await wallets[0].getContractMetadata(tokenContract.address);
    await Promise.all(
      wallets.slice(1).map(wallet => wallet.registerContract(tokenMetadata.instance!, TokenContract.artifact)),
    );
    logger.info('Token contract registered with all wallets');

    // Mint tokens publicly to each account (enough for TX_COUNT transfers).
    // Send sequentially to avoid PXE concurrency issues, then wait in parallel.
    logger.info(`Minting ${TX_COUNT} tokens to each account...`);
    const mintTxHashes = [];
    for (const acc of accountAddresses) {
      const txHash = await TokenContract.at(tokenContract.address, wallets[0])
        .methods.mint_to_public(acc, BigInt(TX_COUNT))
        .send({ from: accountAddresses[0], fee: { paymentMethod: sponsor }, wait: NO_WAIT });
      mintTxHashes.push(txHash);
    }
    await Promise.all(mintTxHashes.map(txHash => waitForTx(aztecNode, txHash, { timeout: 600 })));
    logger.info('Minting complete');
  });

  afterAll(async () => {
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
    createPrototypeFn: (wallet: WorkerWallet, accountAddress: AztecAddress) => Promise<Tx>,
  ): Promise<Tx[]> {
    const txs: Tx[] = [];
    if (config.REAL_VERIFIER || config.DEBUG_FORCE_TX_PROOF_VERIFICATION) {
      for (let i = 0; i < TX_COUNT; i += NUM_WALLETS) {
        const batchSize = Math.min(NUM_WALLETS, TX_COUNT - i);
        const batchTxs = await Promise.all(
          Array.from({ length: batchSize }, (_, j) => createPrototypeFn(wallets[j], accountAddresses[j])),
        );
        txs.push(...batchTxs);
        logger.info(`Proved ${txs.length}/${TX_COUNT} txs`);
      }
    } else {
      const prototypeTx = await createPrototypeFn(wallets[0], accountAddresses[0]);
      logger.info('Prototype tx proved, cloning...');
      for (let i = 0; i < TX_COUNT; i++) {
        txs.push(await cloneTx(prototypeTx, aztecNode));
        if ((i + 1) % 10 === 0 || i === TX_COUNT - 1) {
          logger.info(`Cloned ${i + 1}/${TX_COUNT} txs`);
        }
      }
    }
    return txs;
  }

  /** Floods the mempool with pre-proven txs and measures block capacity. */
  async function floodAndMeasure(label: string, provenTxs: Tx[]): Promise<void> {
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
    await asyncPool(3, provenTxs, async tx => {
      await aztecNode.sendTx(tx);
      sentCount++;
      if (sentCount % 10 === 0 || sentCount === provenTxs.length) {
        logger.info(`[${label}] Sent ${sentCount}/${provenTxs.length} txs`);
      }
    });

    const sendDurationMs = Date.now() - sendStartMs;
    logger.info(`[${label}] All ${provenTxs.length} txs sent to mempool`, { sendDurationMs });

    // 3. Re-enable block building
    logger.info(`[${label}] Re-enabling block building`);
    await updateSequencersConfig(config, { minTxsPerBlock: 1, enforceTimeTable: true });
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

    const timeoutMs = 10 * 60 * 1000; // 10 minutes

    await retryUntil(
      async () => {
        const currentBlock = await aztecNode.getBlockNumber();
        for (let bn = blockBeforeFlood + 1; bn <= currentBlock; bn++) {
          if (blockTxCounts.some(b => b.blockNumber === bn)) {
            continue;
          }
          const block = await aztecNode.getBlock(BlockNumber(bn));
          if (block) {
            const txCount = block.body.txEffects.length;
            blockTxCounts.push({ blockNumber: bn, txCount });
            totalTxsMined += txCount;
            logger.info(`[${label}] Block ${bn}: ${txCount} txs (total mined: ${totalTxsMined}/${TX_COUNT})`);
          }
        }
        return totalTxsMined >= TX_COUNT;
      },
      'all txs mined',
      timeoutMs / 1000,
      2,
    );

    // Log summary
    logger.info(`=== Block Capacity Benchmark Results (${label}) ===`);
    logger.info(`Total txs sent: ${TX_COUNT}`);
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

    expect(totalTxsMined).toBeGreaterThanOrEqual(TX_COUNT);
  }

  it('measures block capacity with private noop txs', async () => {
    logger.info(`Pre-proving ${TX_COUNT} private noop txs...`);
    const txs = await proveOrCloneTxs((wallet, addr) => {
      const contract = BenchmarkingContract.at(benchmarkContract.address, wallet);
      return createProvableTx(wallet, addr, contract.methods.noop());
    });
    logger.info(`All ${TX_COUNT} private noop txs pre-proven`);
    await floodAndMeasure('private noop', txs);
  });

  it('measures block capacity with public noop txs', async () => {
    logger.info(`Pre-proving ${TX_COUNT} public noop txs...`);
    const txs = await proveOrCloneTxs((wallet, addr) => {
      const contract = BenchmarkingContract.at(benchmarkContract.address, wallet);
      return createProvableTx(wallet, addr, contract.methods.noop_pub());
    });
    logger.info(`All ${TX_COUNT} public noop txs pre-proven`);
    await floodAndMeasure('public noop', txs);
  });

  it.only('measures block capacity with public token transfers', async () => {
    // Each account transfers 1 token to a "sink" address.
    // Note: For the clone path, all cloned txs share the same sender/recipient/amount.
    // Public state conflicts may cause some cloned txs to fail during execution.
    const recipient = accountAddresses[0];
    logger.info(`Pre-proving ${TX_COUNT} public token transfer txs...`);
    const txs = await proveOrCloneTxs((wallet, addr) => {
      const token = TokenContract.at(tokenContract.address, wallet);
      return createProvableTx(wallet, addr, token.methods.transfer_in_public(addr, recipient, 1n, 0));
    });
    logger.info(`All ${TX_COUNT} public token transfer txs pre-proven`);
    await floodAndMeasure('public token transfer', txs);
  });
});

/** Clones a proven tx, randomizing nullifiers and updating fees so each clone is unique. */
async function cloneTx(tx: Tx, aztecNode: AztecNode): Promise<Tx> {
  const clonedTx = Tx.clone(tx, false);

  // Fetch current minimum fees and apply 50% buffer for safety
  const currentFees = await aztecNode.getCurrentMinFees();
  const paddedFees = currentFees.mul(1.5);

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
