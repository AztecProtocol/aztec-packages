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
import { TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { expect, jest } from '@jest/globals';
import { createPublicClient, fallback, http } from 'viem';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
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
  const TX_COUNT = Math.max(15, MAX_BLOCKS_PER_SLOT);
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

    originalSequencerConfig = await getSequencersConfig(config);
    const updatedSequencerConfigs = await updateSequencersConfig(config, {
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      blockDurationMs: BLOCK_DURATION_MS,
      enforceTimeTable: true,
    });
    logger.info(
      `Sequencer config after update: ${JSON.stringify(
        updatedSequencerConfigs.map(sequencerConfig => ({
          minTxsPerBlock: sequencerConfig.minTxsPerBlock,
          maxTxsPerBlock: sequencerConfig.maxTxsPerBlock,
          blockDurationMs: sequencerConfig.blockDurationMs,
          enforceTimeTable: sequencerConfig.enforceTimeTable,
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

    // small batch to avoid over oversized requests
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
    const tipsAtReceipts = await aztecNode.getL2Tips();
    logger.info(
      `Tips after receipts: proposed=${tipsAtReceipts.proposed.number}, checkpointed=${tipsAtReceipts.checkpointed.block.number}`,
    );

    const blockNumbers = receipts.map(receipt => Number(receipt!.blockNumber));
    const uniqueBlockNumbers = [...new Set(blockNumbers)];
    expect(uniqueBlockNumbers.length).toBeGreaterThanOrEqual(2); // sanity check

    const headers = await Promise.all(
      uniqueBlockNumbers.map(blockNumber => aztecNode.getBlockHeader(BlockNumber(blockNumber))),
    );
    if (headers.some(header => !header)) {
      throw new Error('Failed to load block headers for submitted txs');
    }

    const headerByBlockNumber = new Map<number, (typeof headers)[number]>();
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      headerByBlockNumber.set(uniqueBlockNumbers[i], headers[i]);
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

    // count blocks in slot
    const slotNumbers = headers.map(header => header!.globalVariables.slotNumber);
    const slotCounts = new Map<number, number>();
    for (const slot of slotNumbers) {
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
    }
    const slotCountsEntries = [...slotCounts.entries()];
    const [_, blocksInSlotCount] = slotCountsEntries.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
    const blockTimeline = headers.map(header => ({
      blockNumber: Number(header!.globalVariables.blockNumber),
      slotNumber: Number(header!.globalVariables.slotNumber),
      timestamp: Number(header!.globalVariables.timestamp),
    }));
    logger.info(`Block timeline: ${JSON.stringify(blockTimeline)}`);
    logger.info(`Blocks per slot: ${JSON.stringify(slotCountsEntries)}`);
    expect(blocksInSlotCount).toBeGreaterThanOrEqual(2);
    const maxBlockNumber = Math.max(...blockNumbers);
    await retryUntil(
      async () => {
        const tips = await aztecNode.getL2Tips();
        return Number(tips.checkpointed.block.number) >= maxBlockNumber;
      },
      'checkpointed tip to reach multi-block slot',
      config.AZTEC_SLOT_DURATION * 10,
      2,
    );
  });
});
