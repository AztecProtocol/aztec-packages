import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { TxHash } from '@aztec/aztec.js/tx';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { expect, jest } from '@jest/globals';
import { createPublicClient, fallback, http } from 'viem';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { proveInteraction } from '../test-wallet/utils.js';
import type { TestAccounts } from './setup_test_wallets.js';
import { createWalletAndAztecNodeClient, deploySponsoredTestAccountsWithTokens } from './setup_test_wallets.js';
import {
  ChainHealth,
  getEthereumEndpoint,
  getRPCEndpoint,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';
import type { ServiceEndpoint } from './utils.js';

const config = setupEnvironment(process.env);

describe('multi-blocks-per-slot network test', () => {
  jest.setTimeout(60 * 60 * 1000); // 60 minutes

  const logger = createLogger('e2e:spartan-test:mbps');
  const endpoints: ServiceEndpoint[] = [];
  const health = new ChainHealth(config.NAMESPACE, logger);

  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let ethereumClient: ViemPublicClient;
  let rollup: RollupContract;
  let cleanup: undefined | (() => Promise<void>);
  let testAccounts: TestAccounts;
  let originalSequencerConfig: Awaited<ReturnType<typeof getSequencersConfig>> | undefined;

  const MINT_AMOUNT = 100_000n;
  const TRANSFER_AMOUNT = 1n;
  const BLOCK_DURATION_MS = 8000;
  const MAX_BLOCKS_PER_SLOT = Math.floor((config.AZTEC_SLOT_DURATION * 1000) / BLOCK_DURATION_MS);
  const TX_COUNT = Math.max(10, MAX_BLOCKS_PER_SLOT);
  const TX_SEND_BATCH_SIZE = Math.min(3, TX_COUNT);

  beforeAll(async () => {
    await health.setup();

    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    endpoints.push(rpcEndpoint);

    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(
      rpcEndpoint.url,
      config.REAL_VERIFIER,
      logger,
    ));
    testAccounts = await deploySponsoredTestAccountsWithTokens(wallet, aztecNode, MINT_AMOUNT, logger);

    const ethEndpoint = await getEthereumEndpoint(config.NAMESPACE);
    endpoints.push(ethEndpoint);
    const nodeInfo = await aztecNode.getNodeInfo();
    const chain = createEthereumChain([ethEndpoint.url], nodeInfo.l1ChainId);
    ethereumClient = createPublicClient({
      chain: chain.chainInfo,
      transport: fallback([http(ethEndpoint.url, { batch: false })]),
    });
    rollup = new RollupContract(ethereumClient, nodeInfo.l1ContractAddresses.rollupAddress);
    const slotDuration = await rollup.getSlotDuration();
    logger.info(`Rollup slotDuration=${slotDuration}s, env AZTEC_SLOT_DURATION=${config.AZTEC_SLOT_DURATION}s`);
    logger.info(
      `MBPS params: blockDurationMs=${BLOCK_DURATION_MS}, maxBlocksPerSlot=${MAX_BLOCKS_PER_SLOT}, txCount=${TX_COUNT}, batchSize=${TX_SEND_BATCH_SIZE}`,
    );

    // Update sequencer config to enable MBPS
    originalSequencerConfig = await getSequencersConfig(config);
    const updatedSequencerConfigs = await updateSequencersConfig(config, {
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      blockDurationMs: BLOCK_DURATION_MS,
<<<<<<< HEAD
      enforceTimeTable: true,
      l1PublishingTime: 2,
=======
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
      attestationPropagationTime: 0.5,
    });
    logger.info(
      `Sequencer config after update: ${JSON.stringify(
        updatedSequencerConfigs.map(sequencerConfig => ({
          minTxsPerBlock: sequencerConfig.minTxsPerBlock,
          maxTxsPerBlock: sequencerConfig.maxTxsPerBlock,
          blockDurationMs: sequencerConfig.blockDurationMs,
<<<<<<< HEAD
          enforceTimeTable: sequencerConfig.enforceTimeTable,
          l1PublishingTime: sequencerConfig.l1PublishingTime,
=======
>>>>>>> ab5413c72dc (feat: merge-train/spartan-v5 (#23975))
          attestationPropagationTime: sequencerConfig.attestationPropagationTime,
        })),
      )}`,
    );
  });

  afterAll(async () => {
    if (originalSequencerConfig?.[0]) {
      await updateSequencersConfig(config, originalSequencerConfig[0]);
    }
    try {
      await retryUntil(
        async () => {
          await getSequencersConfig(config);
          return true;
        },
        'sequencer to be available after restoring config',
        10 * 60,
        5,
      );
    } catch (error) {
      logger.warn(`Failed to confirm sequencer availability after restore: ${String(error)}`);
    }
    await health.teardown();
    await cleanup?.();
    endpoints.forEach(e => e.process?.kill());
  });

  it('includes all submitted txs across multiple blocks in a single slot', async () => {
    const feePaymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());

    logger.info(`Slot before proving: ${await rollup.getSlotNumber()}`);
    const proofStartMs = Date.now();
    const txs = await timesAsync(TX_COUNT, i => {
      const from = testAccounts.accounts[i % testAccounts.accounts.length];
      return proveInteraction(
        wallet,
        testAccounts.tokenContract.methods.transfer_in_public(from, testAccounts.recipientAddress, TRANSFER_AMOUNT, 0),
        { from, fee: { paymentMethod: feePaymentMethod } },
      );
    });
    logger.info(`Proved ${txs.length} txs in ${(Date.now() - proofStartMs) / 1000}s`);

    // small batch to avoid oversized requests
    const txHashes: TxHash[] = [];
    const submitStartMs = Date.now();
    for (let i = 0; i < txs.length; i += TX_SEND_BATCH_SIZE) {
      const batch = txs.slice(i, i + TX_SEND_BATCH_SIZE);
      logger.info(`Submitting tx batch ${i / TX_SEND_BATCH_SIZE + 1}/${Math.ceil(txs.length / TX_SEND_BATCH_SIZE)}`);
      const batchHashes = (await Promise.all(batch.map(tx => tx.send({ wait: NO_WAIT })))) as TxHash[];
      txHashes.push(...batchHashes);
      logger.info(
        `Submitted batch ${i / TX_SEND_BATCH_SIZE + 1} at t=${((Date.now() - submitStartMs) / 1000).toFixed(1)}s`,
      );
    }
    logger.info(
      `Submitted ${txHashes.length} txs in ${(Date.now() - submitStartMs) / 1000}s (total ${(Date.now() - proofStartMs) / 1000}s)`,
    );
    logger.info(`Slot after submit: ${await rollup.getSlotNumber()}`);

    const receipts = await retryUntil(
      async () => {
        const resolved = await Promise.all(
          txHashes.map(async hash => {
            try {
              return await aztecNode.getTxReceipt(hash);
            } catch {
              return undefined;
            }
          }),
        );
        if (resolved.some(receipt => !receipt?.blockNumber)) {
          return undefined;
        }
        return resolved;
      },
      'all tx receipts',
      config.AZTEC_SLOT_DURATION * 10,
      2,
    );
    const tipsAtReceipts = await aztecNode.getChainTips();
    logger.info(
      `Tips after receipts: proposed=${tipsAtReceipts.proposed.number}, checkpointed=${tipsAtReceipts.checkpointed.block.number}`,
    );

    const txBlockNumbers = receipts.map(receipt => Number(receipt!.blockNumber));
    const uniqueTxBlockNumbers = [...new Set(txBlockNumbers)];
    const minTxBlockNumber = Math.min(...txBlockNumbers);
    const maxTxBlockNumber = Math.max(...txBlockNumbers);

    // Fetch all block headers in the range to check for MBPS (not just blocks with our txs)
    const allBlockNumbers = Array.from(
      { length: maxTxBlockNumber - minTxBlockNumber + 1 },
      (_, i) => minTxBlockNumber + i,
    );
    const allHeaders = await Promise.all(
      allBlockNumbers.map(blockNumber => aztecNode.getBlockData(BlockNumber(blockNumber)).then(b => b?.header)),
    );
    if (allHeaders.some(header => !header)) {
      throw new Error('Failed to load block headers for block range');
    }

    const headerByBlockNumber = new Map<number, (typeof allHeaders)[number]>();
    for (let i = 0; i < allBlockNumbers.length; i++) {
      headerByBlockNumber.set(allBlockNumbers[i], allHeaders[i]);
    }
    const receiptSummary = txHashes.map((hash, i) => {
      const receipt = receipts[i]!;
      const blockNumber = Number(receipt.blockNumber);
      const header = headerByBlockNumber.get(blockNumber);
      return {
        txHash: hash.toString(),
        blockNumber,
        slotNumber: header ? Number(header.globalVariables.slotNumber) : undefined,
        timestamp: header ? Number(header.globalVariables.timestamp) : undefined,
      };
    });
    logger.info(`Tx receipt summary: ${JSON.stringify(receiptSummary)}`);

    // Count blocks per slot across all blocks in range (not just blocks with our txs)
    const slotCounts = new Map<number, number>();
    for (const header of allHeaders) {
      const slot = Number(header!.globalVariables.slotNumber);
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
    }
    const slotCountsEntries = [...slotCounts.entries()];
    const [maxSlot, blocksInSlotCount] = slotCountsEntries.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
    const blockTimeline = allHeaders.map(header => ({
      blockNumber: Number(header!.globalVariables.blockNumber),
      slotNumber: Number(header!.globalVariables.slotNumber),
      timestamp: Number(header!.globalVariables.timestamp),
    }));
    logger.info(`Block timeline: ${JSON.stringify(blockTimeline)}`);
    logger.info(`Blocks per slot: ${JSON.stringify(slotCountsEntries)}`);
    logger.info(`Max blocks in a single slot: ${blocksInSlotCount} (slot ${maxSlot})`);
    logger.info(`Txs distributed across ${uniqueTxBlockNumbers.length} blocks`);
    expect(blocksInSlotCount).toBeGreaterThanOrEqual(2);
    await retryUntil(
      async () => {
        const tips = await aztecNode.getChainTips();
        return Number(tips.checkpointed.block.number) >= maxTxBlockNumber;
      },
      'checkpointed tip to reach multi-block slot',
      config.AZTEC_SLOT_DURATION * 10,
      2,
    );
  });
});
