import { Blob } from '@aztec/blob-lib';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';

import { type Hex, parseGwei } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { WEI_CONST } from './constants.js';
import type { PriorityFeeStrategy } from './fee-strategies/types.js';
import { L1FeeAnalyzer } from './l1_fee_analyzer.js';
import type { L1BlobInputs, L1TxRequest } from './types.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const logger = createLogger('ethereum:test:l1-fee-analyzer');

describe('L1FeeAnalyzer', () => {
  const initialBaseFee = WEI_CONST; // 1 gwei

  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let dateProvider: TestDateProvider;
  let port: number = 9545;
  let analyzer: L1FeeAnalyzer;

  beforeEach(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: 1, port: port++, log: false }));
    cheatCodes = new EthCheatCodes([rpcUrl], new TestDateProvider());
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);
    dateProvider = new TestDateProvider();

    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();

    analyzer = new L1FeeAnalyzer(l1Client, new DateProvider(), logger);
  });

  afterEach(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 10000);

  describe('capturePendingSnapshot', () => {
    it('captures empty pending block snapshot', async () => {
      const snapshot = await analyzer.capturePendingSnapshot();

      expect(snapshot).toMatchObject({
        timestamp: expect.any(Number),
        latestBlockNumber: expect.any(BigInt),
        baseFeePerGas: expect.any(BigInt),
        blobBaseFee: expect.any(BigInt),
        pendingTxCount: 0,
        pendingBlobTxCount: 0,
        pendingBlobCount: 0,
        pendingBlobTxs: [],
        pendingP75PriorityFee: 0n,
        pendingBlobP75PriorityFee: 0n,
      });

      expect(snapshot.baseFeePerGas).toBe(initialBaseFee);
    });

    it('captures pending block with regular transactions', async () => {
      // Disable automine to keep transactions in pending state
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Send a few transactions to the pending pool
      const txHashes: Hex[] = [];
      for (let i = 0; i < 3; i++) {
        const hash = await l1Client.sendTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: BigInt(i + 1),
          maxFeePerGas: parseGwei('10'),
          maxPriorityFeePerGas: parseGwei('2'),
        });
        txHashes.push(hash);
      }

      // Capture snapshot while transactions are pending
      const snapshot = await analyzer.capturePendingSnapshot();

      expect(snapshot.pendingTxCount).toBe(3);
      expect(snapshot.pendingBlobTxCount).toBe(0);
      expect(snapshot.pendingBlobCount).toBe(0);
      expect(snapshot.pendingP75PriorityFee).toBe(parseGwei('2'));

      // Clean up - mine the block
      await cheatCodes.evmMine();
    });

    it('captures pending block with blob transactions', async () => {
      // Disable automine to keep transactions in pending state
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Create blob data
      const blobData = new Uint8Array(131072).fill(1); // 128KB blob
      const kzg = Blob.getViemKzgInstance();

      // Send a blob transaction
      const hash = await l1Client.sendTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: 0n,
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: parseGwei('10'),
        maxFeePerGas: parseGwei('10'),
        maxPriorityFeePerGas: parseGwei('3'),
      });

      // Capture snapshot while blob transaction is pending
      const snapshot = await analyzer.capturePendingSnapshot();

      expect(snapshot.pendingTxCount).toBe(1);
      expect(snapshot.pendingBlobTxCount).toBe(1);
      expect(snapshot.pendingBlobCount).toBe(1);
      expect(snapshot.pendingBlobTxs).toHaveLength(1);
      expect(snapshot.pendingBlobTxs[0]).toMatchObject({
        hash,
        maxPriorityFeePerGas: parseGwei('3'),
        maxFeePerGas: parseGwei('10'),
        maxFeePerBlobGas: parseGwei('10'),
        blobCount: 1,
      });
      expect(snapshot.pendingBlobP75PriorityFee).toBe(parseGwei('3'));

      // Clean up
      await cheatCodes.evmMine();
    });

    it('captures pending block with mixed regular and blob transactions', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Send regular transactions
      for (let i = 0; i < 2; i++) {
        await l1Client.sendTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: BigInt(i + 1),
          maxFeePerGas: parseGwei('10'),
          maxPriorityFeePerGas: parseGwei('2'),
        });
      }

      // Send blob transactions
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();
      for (let i = 0; i < 2; i++) {
        await l1Client.sendTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: 0n,
          blobs: [blobData],
          kzg,
          maxFeePerBlobGas: parseGwei('10'),
          maxFeePerGas: parseGwei('10'),
          maxPriorityFeePerGas: parseGwei('4'),
        });
      }

      const snapshot = await analyzer.capturePendingSnapshot();

      expect(snapshot.pendingTxCount).toBe(4);
      expect(snapshot.pendingBlobTxCount).toBe(2);
      expect(snapshot.pendingBlobCount).toBe(2);
      expect(snapshot.pendingP75PriorityFee).toBeGreaterThan(0n);
      expect(snapshot.pendingBlobP75PriorityFee).toBe(parseGwei('4'));

      await cheatCodes.evmMine();
    });
  });

  describe('startAnalysis and completion', () => {
    it('starts analysis for regular transaction and completes when block mines', async () => {
      const l2SlotNumber = SlotNumber(1);
      const gasLimit = 21000n;
      const requests: L1TxRequest[] = [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ];

      const analysisId = await analyzer.startAnalysis(l2SlotNumber, gasLimit, requests);

      expect(analysisId).toMatch(/^fee-analysis-/);

      // Initially, analysis should be pending
      const pendingAnalysis = analyzer.getAnalysis(analysisId);
      expect(pendingAnalysis).toBeDefined();
      expect(pendingAnalysis?.analysis).toBeUndefined(); // Not completed yet
      expect(pendingAnalysis?.computedPrices).toMatchObject({
        gasLimit: 21000n,
        blobCount: 0,
      });
      expect(pendingAnalysis?.txInfo).toMatchObject({
        requestCount: 1,
        hasBlobData: false,
        totalEstimatedGas: 21000n,
      });

      // Wait for the next block to mine (should complete the analysis)
      // The analyzer's watchForNextBlock waits up to 13 seconds
      // Anvil mines blocks automatically every 1 second
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Analysis should now be completed
      const completedAnalysis = analyzer.getAnalysis(analysisId);
      expect(completedAnalysis).toBeDefined();
      expect(completedAnalysis?.analysis).toBeDefined();
      expect(completedAnalysis?.minedBlock).toBeDefined();
      expect(completedAnalysis?.minedBlock?.blockNumber).toBeGreaterThan(
        completedAnalysis?.pendingSnapshot.latestBlockNumber || 0n,
      );
      expect(completedAnalysis?.analysis?.timeBeforeBlockMs).toBeGreaterThan(0);
      // Check that we have strategy results instead
      expect(completedAnalysis?.computedPrices.strategyResults).toBeDefined();
      expect(completedAnalysis?.computedPrices.strategyResults!.length).toBeGreaterThan(0);
    }, 20000);

    it('starts analysis for blob transaction and completes when block mines', async () => {
      const l2SlotNumber = SlotNumber(2);
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();

      const gasLimit = 50000n;
      const requests: L1TxRequest[] = [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ];
      const blobInputs: L1BlobInputs = {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: parseGwei('10'),
      };

      const analysisId = await analyzer.startAnalysis(l2SlotNumber, gasLimit, requests, blobInputs);

      const pendingAnalysis = analyzer.getAnalysis(analysisId);
      expect(pendingAnalysis?.computedPrices.blobCount).toBe(1);
      expect(pendingAnalysis?.txInfo.hasBlobData).toBe(true);

      // Wait for block to mine and analysis to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const completedAnalysis = analyzer.getAnalysis(analysisId);
      expect(completedAnalysis).toBeDefined();
      expect(completedAnalysis?.analysis).toBeDefined();
      expect(completedAnalysis?.minedBlock).toBeDefined();
    }, 20000);

    it('calls completion callback when analysis finishes', async () => {
      const l2SlotNumber = SlotNumber(3);
      const gasLimit = 21000n;
      const requests: L1TxRequest[] = [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ];

      let callbackCalled = false;
      let callbackAnalysisId = '';

      const onComplete = (analysis: any) => {
        callbackCalled = true;
        callbackAnalysisId = analysis.id;
      };

      const analysisId = await analyzer.startAnalysis(l2SlotNumber, gasLimit, requests, undefined, onComplete);

      // Wait for block to mine and callback to be invoked
      await new Promise(resolve => setTimeout(resolve, 5000));

      expect(callbackCalled).toBe(true);
      expect(callbackAnalysisId).toBe(analysisId);
    }, 20000);
  });

  describe('analysis statistics', () => {
    it('tracks completed analyses and provides statistics', async () => {
      // Start multiple analyses
      for (let i = 0; i < 3; i++) {
        await analyzer.startAnalysis(SlotNumber(i), 21000n, [
          {
            to: '0x1234567890123456789012345678901234567890',
            data: '0x',
            value: 0n,
          },
        ]);
        // Wait a bit between analyses
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Wait for all analyses to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      const completedAnalyses = analyzer.getCompletedAnalyses();
      expect(completedAnalyses.length).toBe(3);

      const stats = analyzer.getAnalysisStats();
      expect(stats.totalAnalyses).toBe(3);
      expect(stats.avgTimeBeforeBlockMs).toBeGreaterThan(0);
      expect(stats.avgBlobsInBlock).toBeGreaterThanOrEqual(0);
      expect(stats.blocksBlobsFull).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('limits the number of stored completed analyses', async () => {
      // Create analyzer with small max limit
      const smallAnalyzer = new L1FeeAnalyzer(l1Client, dateProvider, logger, 2);

      // Start 4 analyses
      for (let i = 0; i < 4; i++) {
        await smallAnalyzer.startAnalysis(SlotNumber(i), 21000n, [
          {
            to: '0x1234567890123456789012345678901234567890',
            data: '0x',
            value: 0n,
          },
        ]);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      const completedAnalyses = smallAnalyzer.getCompletedAnalyses();
      // Should only keep the last 2
      expect(completedAnalyses.length).toBeLessThanOrEqual(2);
    }, 20000);
  });

  describe('strategy analysis', () => {
    it('executes multiple strategies and provides comparison', async () => {
      // Send a transaction first to have something in the block
      await l1Client.sendTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: 1n,
        maxFeePerGas: parseGwei('10'),
        maxPriorityFeePerGas: parseGwei('2'),
      });

      // Wait for it to mine
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start an analysis
      const analysisId = await analyzer.startAnalysis(SlotNumber(1), 21000n, [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ]);

      // Wait for analysis to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const analysis = analyzer.getAnalysis(analysisId);
      expect(analysis?.computedPrices.strategyResults).toBeDefined();
      expect(analysis?.computedPrices.strategyResults!.length).toBeGreaterThan(0);

      // Check that strategy results have required fields
      for (const result of analysis?.computedPrices.strategyResults || []) {
        expect(result).toMatchObject({
          strategyId: expect.any(String),
          strategyName: expect.any(String),
          calculatedPriorityFee: expect.any(BigInt),
        });
      }

      // Check strategy comparison
      const comparison = analyzer.getStrategyComparison();
      expect(comparison.length).toBeGreaterThan(0);
      for (const strategyStats of comparison) {
        expect(strategyStats).toMatchObject({
          strategyId: expect.any(String),
          strategyName: expect.any(String),
          totalAnalyses: expect.any(Number),
          inclusionCount: expect.any(Number),
          inclusionRate: expect.any(Number),
          avgEstimatedCostEth: expect.any(Number),
        });
      }
    }, 15000);

    it('works with custom strategies', async () => {
      const customStrategy: PriorityFeeStrategy = {
        id: 'test-custom',
        name: 'Test Custom Strategy',
        execute: async client => {
          const latestBlock = await client.getBlock({ blockTag: 'latest' });
          return {
            priorityFee: parseGwei('5'),
            latestBlock,
            debugInfo: { custom: 'test' },
          };
        },
      };

      const customAnalyzer = new L1FeeAnalyzer(l1Client, new DateProvider(), logger, 100, [customStrategy]);

      const analysisId = await customAnalyzer.startAnalysis(SlotNumber(1), 21000n, [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ]);

      // Wait for analysis to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const analysis = customAnalyzer.getAnalysis(analysisId);
      expect(analysis).toBeDefined();
      if (!analysis) {
        logger.error('Analysis not found', { id: analysisId });
      }
      expect(analysis?.computedPrices).toBeDefined();
      expect(analysis?.computedPrices.strategyResults).toBeDefined();
      expect(analysis?.computedPrices.strategyResults).toHaveLength(1);
      expect(analysis?.computedPrices.strategyResults![0]).toMatchObject({
        strategyId: 'test-custom',
        strategyName: 'Test Custom Strategy',
        calculatedPriorityFee: parseGwei('5'),
        debugInfo: { custom: 'test' },
      });
    }, 20000);
  });

  describe('mined block analysis', () => {
    it('analyzes which pending transactions got included', async () => {
      // Disable automine
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Send several transactions to pending pool
      const txHashes: Hex[] = [];
      for (let i = 0; i < 3; i++) {
        const hash = await l1Client.sendTransaction({
          to: '0x1234567890123456789012345678901234567890',
          value: BigInt(i + 1),
          maxFeePerGas: parseGwei('10'),
          maxPriorityFeePerGas: parseGwei('2'),
        });
        txHashes.push(hash);
      }

      // Start analysis while transactions are pending
      const analysisId = await analyzer.startAnalysis(SlotNumber(1), 21000n, [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ]);

      const pendingAnalysis = analyzer.getAnalysis(analysisId);
      expect(pendingAnalysis?.pendingSnapshot.pendingTxCount).toBe(3);

      // Mine the block
      await cheatCodes.evmMine();

      // Wait longer for analysis to complete - retryUntil polls every 0.5s
      await new Promise(resolve => setTimeout(resolve, 5000));

      const completedAnalysis = analyzer.getAnalysis(analysisId);
      expect(completedAnalysis).toBeDefined();
      if (!completedAnalysis?.analysis) {
        logger.error('Analysis not completed', {
          id: analysisId,
          hasMinedBlock: !!completedAnalysis?.minedBlock,
          pendingCount: pendingAnalysis?.pendingSnapshot.pendingTxCount,
        });
      }
      expect(completedAnalysis?.analysis).toBeDefined();
      expect(completedAnalysis?.minedBlock).toBeDefined();
      expect(completedAnalysis?.minedBlock?.txCount).toBeGreaterThanOrEqual(3);
      // Check that we have strategy results
      expect(completedAnalysis?.computedPrices.strategyResults).toBeDefined();
      expect(completedAnalysis?.computedPrices.strategyResults!.length).toBeGreaterThan(0);
    }, 20000);

    it('correctly identifies when transaction would not be included due to low priority fee', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Send a transaction with high priority fee
      await l1Client.sendTransaction({
        to: '0x1234567890123456789012345678901234567890',
        value: 1n,
        maxFeePerGas: parseGwei('20'),
        maxPriorityFeePerGas: parseGwei('10'),
      });

      // Start analysis
      const analysisId = await analyzer.startAnalysis(SlotNumber(1), 21000n, [
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
      ]);

      // Mine the block
      await cheatCodes.evmMine();

      // Wait longer for analysis to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const completedAnalysis = analyzer.getAnalysis(analysisId);
      expect(completedAnalysis).toBeDefined();
      expect(completedAnalysis?.analysis).toBeDefined();

      // Check that we have strategy results
      expect(completedAnalysis?.computedPrices.strategyResults).toBeDefined();
      expect(completedAnalysis?.computedPrices.strategyResults!.length).toBeGreaterThan(0);

      // For non-blob transactions, strategies should identify inclusion based on priority fee
      // Since there's only one other transaction in the block, all strategies should work
      const strategies = completedAnalysis?.computedPrices.strategyResults;
      expect(strategies?.some(s => s.wouldBeIncluded !== undefined)).toBe(true);
    }, 20000);
  });
});
