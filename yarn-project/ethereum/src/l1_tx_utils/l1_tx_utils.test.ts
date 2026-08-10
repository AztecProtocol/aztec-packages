import { Blob } from '@aztec/blob-lib';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { retryFastUntil, retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';
import { getErrorCause } from '@aztec/foundation/types';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import assert from 'node:assert';
import {
  type Abi,
  type BlockTag,
  type GetTransactionParameters,
  type Hex,
  MethodNotFoundRpcError,
  RpcRequestError,
  TransactionNotFoundError,
  type TransactionSerializable,
  createPublicClient,
  encodeFunctionData,
  http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { L1RpcError, createExtendedL1Client, getPublicClient } from '../client.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import {
  type IL1TxMetrics,
  type IL1TxStore,
  type L1TxRequest,
  type L1TxState,
  type L1TxUtilsConfig,
  MAX_L1_TX_LIMIT,
  ReadOnlyL1TxUtils,
  TxUtilsState,
  UnknownMinedTxError,
  createL1TxUtils,
  defaultL1TxUtilsConfig,
} from './index.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { createViemSigner } from './signer.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
const logger = createLogger('ethereum:test:l1_tx_utils');
// Simple contract that just returns 42
const SIMPLE_CONTRACT_BYTECODE = '0x69602a60005260206000f3600052600a6016f3';

const CHECK_INTERVAL_MS = process.env.TEST_CHECK_INTERVAL_MS ? parseInt(process.env.TEST_CHECK_INTERVAL_MS) : 100;

export type PendingTransaction = {
  hash: `0x${string}`;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

describe('L1TxUtils', () => {
  const initialBaseFee = WEI_CONST; // 1 gwei

  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let dateProvider: TestDateProvider;
  let port: number = 8545;
  let metrics: MockProxy<IL1TxMetrics>;

  beforeEach(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: 1, port: port++, log: false }));
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);
    dateProvider = new TestDateProvider();
    metrics = mock<IL1TxMetrics>();

    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();
  });

  afterEach(async () => {
    await cheatCodes.setIntervalMining(0); // Disable interval mining to ensure anvil stops properly
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 5000);

  describe('L1TxUtils with blobs', () => {
    let gasUtils: TestL1TxUtils;
    let config: Partial<L1TxUtilsConfig>;

    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0xabcdef' as `0x${string}`,
      value: 1n,
    };

    const createL1TxUtils = () =>
      new TestL1TxUtils(
        l1Client,
        EthAddress.fromString(l1Client.account.address),
        createViemSigner(l1Client),
        logger,
        dateProvider,
        config,
        undefined,
        undefined,
        metrics,
        Blob.getViemKzgInstance(),
        undefined,
      );

    beforeEach(() => {
      config = {
        gasLimitBufferPercentage: 20,
        maxGwei: 500,
        maxSpeedUpAttempts: 3,
        checkIntervalMs: CHECK_INTERVAL_MS,
        stallTimeMs: 1000,
      };

      gasUtils = createL1TxUtils();
    });

    afterEach(async () => {
      gasUtils.interrupt();
      await gasUtils.waitMonitoringStopped(1);
    });

    it('recovery send reuses nonce after sendRawTransaction fails', async () => {
      // Send a successful tx first to advance the chain nonce
      await gasUtils.sendAndMonitorTransaction(request);

      const expectedNonce = await l1Client.getTransactionCount({
        blockTag: 'pending',
        address: l1Client.account.address,
      });

      // Next send fails at sendRawTransaction (e.g. network error / 429)
      const originalSendRawTransaction = l1Client.sendRawTransaction.bind(l1Client);
      using _sendSpy = jest
        .spyOn(l1Client, 'sendRawTransaction')
        .mockImplementationOnce(() => Promise.reject(new Error('network error')))
        .mockImplementation(originalSendRawTransaction);

      await expect(gasUtils.sendTransaction(request)).rejects.toThrow('network error');

      // Recovery send should reuse the same nonce (not skip ahead)
      const { txHash, state: recoveryState } = await gasUtils.sendTransaction(request);

      expect(recoveryState.nonce).toBe(expectedNonce);
      expect((await l1Client.getTransaction({ hash: txHash })).nonce).toBe(expectedNonce);
    }, 30_000);

    it('bumps nonce when getTransactionCount returns a stale value after a successful send', async () => {
      // Send a successful tx first to advance the chain nonce
      await gasUtils.sendAndMonitorTransaction(request);

      const expectedNonce = await l1Client.getTransactionCount({
        blockTag: 'pending',
        address: l1Client.account.address,
      });

      // Simulate a stale fallback RPC node that returns the pre-send nonce
      const originalGetTransactionCount = l1Client.getTransactionCount.bind(l1Client);
      using _spy = jest
        .spyOn(l1Client, 'getTransactionCount')
        .mockImplementationOnce(() => Promise.resolve(expectedNonce - 1)) // stale: one behind
        .mockImplementation(originalGetTransactionCount);

      // Despite the stale count, the send should use lastSentNonce+1 = expectedNonce
      const { txHash, state } = await gasUtils.sendTransaction(request);

      expect(state.nonce).toBe(expectedNonce);
      expect((await l1Client.getTransaction({ hash: txHash })).nonce).toBe(expectedNonce);
    }, 30_000);

    it('concurrent sendTransaction calls use sequential nonces (A-810 nonce race fix)', async () => {
      // Fire two sends concurrently on the same L1TxUtils. Without the mutex, both could read
      // the same nonce before either updates lastSentNonce, causing a duplicate-nonce failure.
      const req1 = { ...request, value: 1n };
      const req2 = { ...request, value: 2n };

      const [result1, result2] = await Promise.all([gasUtils.sendTransaction(req1), gasUtils.sendTransaction(req2)]);

      expect(result1.state.nonce).not.toBe(result2.state.nonce);
      expect(Math.abs(result1.state.nonce - result2.state.nonce)).toBe(1);
      expect((await l1Client.getTransaction({ hash: result1.txHash })).nonce).toBe(result1.state.nonce);
      expect((await l1Client.getTransaction({ hash: result2.txHash })).nonce).toBe(result2.state.nonce);
    }, 30_000);

    // Regression for TMNT-312
    it('speed-up of blob tx sets non-zero maxFeePerBlobGas', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      gasUtils.updateConfig({ maxSpeedUpAttempts: 1, checkIntervalMs: 100, stallTimeMs: 1000 });

      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      } as const;

      // Send initial blob tx with a valid maxFeePerBlobGas
      const { state } = await gasUtils.sendTransaction(request, undefined, {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 10n * WEI_CONST,
      });

      // Capture the replacement tx when it is being signed
      const originalSign = l1Client.signTransaction;
      const signedTxs: TransactionSerializable[] = [];
      using _spy = jest.spyOn(l1Client, 'signTransaction').mockImplementation((arg: any) => {
        signedTxs.push(arg);
        return originalSign(arg);
      });

      // Trigger monitor with blob inputs but WITHOUT maxFeePerBlobGas so the bug manifests
      delete state.blobInputs!.maxFeePerBlobGas;
      const monitorPromise = gasUtils.monitorTransaction(state);

      // Wait until a speed-up is attempted
      logger.warn('Waiting for speed-up to be detected');
      await cheatCodes.mineEmptyBlock();
      await retryUntil(
        () => gasUtils.state === TxUtilsState.SPEED_UP && signedTxs.length > 0,
        'waiting for speed-up',
        40,
        0.05,
      );

      // Interrupt to stop the monitor loop and avoid hanging the test
      logger.warn('Interrupting publisher');
      gasUtils.interrupt();
      await expect(monitorPromise).rejects.toThrow();

      // Ensure we captured a replacement tx being signed
      expect(signedTxs.length).toBeGreaterThan(0);
      const replacement = signedTxs[signedTxs.length - 1] as any;

      // Assert fix: maxFeePerBlobGas is populated and non-zero on replacement
      expect(replacement.maxFeePerBlobGas).toBeDefined();
      expect(replacement.maxFeePerBlobGas!).toBeGreaterThan(0n);
    }, 20_000);

    it('sends and monitors a simple transaction', async () => {
      const { receipt } = await gasUtils.sendAndMonitorTransaction({
        to: '0x1234567890123456789012345678901234567890',
        data: '0x',
        value: 0n,
      });

      expect(receipt.status).toBe('success');
      expect(gasUtils.state).toBe(TxUtilsState.MINED);
    }, 10_000);

    it('handles gas price spikes by retrying with higher gas price', async () => {
      // Disable all forms of mining
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Add blob data
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      };

      const estimatedGas = await l1Client.estimateGas(request);

      const originalMaxFeePerGas = WEI_CONST * 10n;
      const originalMaxPriorityFeePerGas = WEI_CONST;
      const originalMaxFeePerBlobGas = WEI_CONST * 10n;

      const txHash = await l1Client.sendTransaction({
        ...request,
        gas: estimatedGas,
        maxFeePerGas: originalMaxFeePerGas,
        maxPriorityFeePerGas: originalMaxPriorityFeePerGas,
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: originalMaxFeePerBlobGas,
      });

      const rawTx = await cheatCodes.getRawTransaction(txHash);

      // Temporarily drop the transaction
      await cheatCodes.dropTransaction(txHash);

      // Mine a block with higher base fee
      await cheatCodes.setNextBlockBaseFeePerGas((WEI_CONST * 15n) / 10n);
      await cheatCodes.evmMine();

      // Re-add the original tx
      await l1Client.transport.request({
        method: 'eth_sendRawTransaction',
        params: [rawTx],
      });

      // Monitor should detect stall and replace with higher gas price
      const tx = await l1Client.getTransaction({ hash: txHash });
      const now = new Date();
      const testState: L1TxState = {
        id: tx.nonce,
        txConfigOverrides: config,
        request,
        txHashes: [txHash],
        cancelTxHashes: [],
        status: TxUtilsState.SENT,
        gasLimit: estimatedGas,
        feeCaps: {
          maxFeePerGas: originalMaxFeePerGas,
          maxPriorityFeePerGas: originalMaxPriorityFeePerGas,
          maxFeePerBlobGas: WEI_CONST * 20n,
        },
        nonce: tx.nonce,
        sentAtL1Ts: now,
        lastSentAtL1Ts: now,
        blobInputs: {
          blobs: [blobData],
          kzg,
          maxFeePerBlobGas: WEI_CONST * 20n,
        },
      };

      // We need to manually track the state since we're not using `send` from l1txutils
      gasUtils.addTxState(testState);

      const monitorFn = gasUtils.monitorTransaction(testState);

      await sleep(1000);
      expect(gasUtils.state).toBe(TxUtilsState.SPEED_UP);
      logger.warn(`Tx has been speed-up`);

      // re-enable mining
      await cheatCodes.setIntervalMining(1);
      logger.warn(`Mining has been re-enabled`);
      const receipt = await monitorFn;
      logger.warn(`Monitoring finished`, { receipt });
      expect(receipt.status).toBe('success');
      expect(gasUtils.state).toBe(TxUtilsState.MINED);

      // Verify that a replacement transaction was created
      expect(receipt.transactionHash).not.toBe(txHash);

      // Get details of replacement tx to verify higher gas prices
      const replacementTx = await l1Client.getTransaction({ hash: receipt.transactionHash });

      expect(replacementTx.maxFeePerGas!).toBeGreaterThan(originalMaxFeePerGas);
      expect(replacementTx.maxPriorityFeePerGas!).toBeGreaterThan(originalMaxPriorityFeePerGas);
      expect(replacementTx.maxFeePerBlobGas!).toBeGreaterThan(originalMaxFeePerBlobGas);
    }, 20_000);

    it('respects max gas price limits during spikes', async () => {
      const maxGwei = 500;
      const newBaseFee = BigInt((maxGwei - 10) * Number(WEI_CONST));

      // Set base fee high but still under our max
      await cheatCodes.setNextBlockBaseFeePerGas(newBaseFee);

      // Mine a new block to make the base fee change take effect
      await cheatCodes.evmMine();

      const { receipt } = await gasUtils.sendAndMonitorTransaction(
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
        { maxGwei },
      );

      expect(receipt.effectiveGasPrice).toBeLessThanOrEqual(BigInt(maxGwei * Number(WEI_CONST)));
    }, 60_000);

    it('adds appropriate buffer to gas estimation', async () => {
      const stableBaseFee = WEI_CONST * 10n;
      await cheatCodes.setNextBlockBaseFeePerGas(stableBaseFee);
      await cheatCodes.evmMine();

      // First deploy without any buffer
      gasUtils.updateConfig({
        gasLimitBufferPercentage: 0,
        maxGwei: 500,
        maxSpeedUpAttempts: 5,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      });

      const { receipt: baselineTx } = await gasUtils.sendAndMonitorTransaction({
        to: EthAddress.ZERO.toString(),
        data: SIMPLE_CONTRACT_BYTECODE,
      });

      // Get the transaction details to see the gas limit
      const baselineDetails = await l1Client.getTransaction({
        hash: baselineTx.transactionHash,
      });

      // Now deploy with 20% buffer
      gasUtils.updateConfig({
        gasLimitBufferPercentage: 20,
        maxGwei: 500,
        maxSpeedUpAttempts: 3,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      });

      const { receipt: bufferedTx } = await gasUtils.sendAndMonitorTransaction({
        to: EthAddress.ZERO.toString(),
        data: SIMPLE_CONTRACT_BYTECODE,
      });

      const bufferedDetails = await l1Client.getTransaction({
        hash: bufferedTx.transactionHash,
      });

      // The gas limit should be ~20% higher
      expect(bufferedDetails.gas).toBeGreaterThan(baselineDetails.gas);
      expect(bufferedDetails.gas).toBeLessThanOrEqual((baselineDetails.gas * 120n) / 100n);
    }, 20_000);

    it('calculates correct gas prices for initial attempt', async () => {
      // Set base fee to 1 gwei
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock estimateMaxPriorityFeePerGas to return a consistent value (1 gwei)
      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      const mockBasePriorityFee = WEI_CONST; // 1 gwei
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(mockBasePriorityFee);

      try {
        const feeCaps = await gasUtils['getFeeCaps']();

        // With default config, priority fee should be bumped by 20%
        const expectedPriorityFee = (mockBasePriorityFee * 120n) / 100n;

        // Base fee should be bumped for potential stalls (1.125^(stallTimeMs/12000) = ~1.125 for default config)
        const expectedMaxFee = (WEI_CONST * 1125n) / 1000n + expectedPriorityFee;

        expect(feeCaps.maxPriorityFeePerGas).toBe(expectedPriorityFee);
        expect(feeCaps.maxFeePerGas).toBe(expectedMaxFee);
      } finally {
        // Restore original method
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('bumps gas fees correctly at very low wei values (ceiling division)', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(1n);
      await cheatCodes.evmMine();

      const originalGetBlobBaseFee = l1Client.getBlobBaseFee;
      l1Client.getBlobBaseFee = () => Promise.resolve(1n);

      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(0n);

      try {
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          stallTimeMs: 12_000,
          priorityFeeBumpPercentage: 0,
          minimumPriorityFeePerGas: 0,
        });

        const feeCaps = await gasUtils['getFeeCaps'](undefined, true);

        // With ceiling division: (1n * 1125n + 999n) / 1000n = 2n
        expect(feeCaps.maxFeePerGas).toBe(2n);
        expect(feeCaps.maxFeePerBlobGas).toBe(2n);

        // Verify compounding works across multiple iterations
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          stallTimeMs: 24_000,
          priorityFeeBumpPercentage: 0,
          minimumPriorityFeePerGas: 0,
        });

        const feeCaps2 = await gasUtils['getFeeCaps'](undefined, true);

        // Iteration 1: ceil(1 * 1125 / 1000) = 2
        // Iteration 2: ceil(2 * 1125 / 1000) = ceil(2.25) = 3
        expect(feeCaps2.maxFeePerGas).toBe(3n);
        expect(feeCaps2.maxFeePerBlobGas).toBe(3n);
      } finally {
        l1Client.getBlobBaseFee = originalGetBlobBaseFee;
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('calculates correct gas prices for retry attempts', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      const initialFeeCaps = await gasUtils['getFeeCaps']();

      // Get retry gas price for 2nd attempt
      const retryFeeCaps = await gasUtils['getFeeCaps'](undefined, false, 1, initialFeeCaps);

      // With default config, retry should bump fees by 50%
      const expectedPriorityFee = (initialFeeCaps.maxPriorityFeePerGas * 150n) / 100n;
      const expectedMaxFee = (initialFeeCaps.maxFeePerGas * 150n) / 100n;

      expect(retryFeeCaps.maxPriorityFeePerGas).toBe(expectedPriorityFee);
      expect(retryFeeCaps.maxFeePerGas).toBe(expectedMaxFee);
    });

    it('handles minimum priority fee with fractional part', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock estimateMaxPriorityFeePerGas to return a very low value (0.1 gwei)
      // so that the minimum takes effect
      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      const mockLowPriorityFee = WEI_CONST / 10n; // 0.1 gwei
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(mockLowPriorityFee);

      try {
        // Test with a fractional minimum priority fee (1.5 gwei)
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          minimumPriorityFeePerGas: 1.5,
          priorityFeeBumpPercentage: 0, // No bump to make test clearer
        });

        const feeCaps = await gasUtils['getFeeCaps']();

        // Priority fee should be at least 1.5 gwei = 1_500_000_000 wei (the minimum)
        const expectedMinimumFee = BigInt(Math.trunc(1.5 * Number(WEI_CONST)));
        expect(feeCaps.maxPriorityFeePerGas).toBe(expectedMinimumFee);
        expect(feeCaps.maxPriorityFeePerGas).toBe(1_500_000_000n);

        // Test with full 9 decimal places (2.123456789 gwei)
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          minimumPriorityFeePerGas: 2.123456789,
          priorityFeeBumpPercentage: 0, // No bump to make test clearer
        });

        const feeCaps2 = await gasUtils['getFeeCaps']();

        const expectedMinimumFee2 = BigInt(Math.trunc(2.123456789 * Number(WEI_CONST)));
        expect(feeCaps2.maxPriorityFeePerGas).toBe(expectedMinimumFee2);
        expect(feeCaps2.maxPriorityFeePerGas).toBe(2_123_456_789n);
      } finally {
        // Restore original method
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('uses network fee when it exceeds minimum priority fee', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock estimateMaxPriorityFeePerGas to return a high value (5 gwei)
      // that exceeds our minimum (1 gwei)
      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      const mockHighPriorityFee = WEI_CONST * 5n; // 5 gwei
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(mockHighPriorityFee);

      try {
        // Set a low minimum priority fee (1 gwei) - network fee (5 gwei) should be used instead
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          minimumPriorityFeePerGas: 1, // 1 gwei minimum
          priorityFeeBumpPercentage: 0, // No bump to make test clearer
        });

        const feeCaps = await gasUtils['getFeeCaps']();

        // Network fee (5 gwei) should be used since it exceeds the minimum (1 gwei)
        const minimumFee = WEI_CONST; // 1 gwei
        expect(feeCaps.maxPriorityFeePerGas).toBeGreaterThan(minimumFee);
        expect(feeCaps.maxPriorityFeePerGas).toBe(mockHighPriorityFee);
      } finally {
        // Restore original method
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('uses network fee with bump when it exceeds minimum priority fee', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock estimateMaxPriorityFeePerGas to return a moderate value (3 gwei)
      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      const mockNetworkFee = WEI_CONST * 3n; // 3 gwei
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(mockNetworkFee);

      try {
        // Set a low minimum (1 gwei) and 20% bump
        // Network fee (3 gwei) + 20% bump = 3.6 gwei should be used
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          minimumPriorityFeePerGas: 1, // 1 gwei minimum
          priorityFeeBumpPercentage: 20, // 20% bump
        });

        const feeCaps = await gasUtils['getFeeCaps']();

        // Expected: network fee (3 gwei) with 20% bump = 3.6 gwei
        const expectedFee = (mockNetworkFee * 120n) / 100n;
        expect(feeCaps.maxPriorityFeePerGas).toBe(expectedFee);
        expect(feeCaps.maxPriorityFeePerGas).toBe(3_600_000_000n);
      } finally {
        // Restore original method
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('handles maxGwei with fractional part', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Test with a fractional maxGwei (500.5 gwei)
      gasUtils.updateConfig({
        ...defaultL1TxUtilsConfig,
        maxGwei: 500.5,
      });

      // Set very high base fee to trigger the max cap
      const highBaseFee = WEI_CONST * 600n; // 600 gwei
      await cheatCodes.setNextBlockBaseFeePerGas(highBaseFee);
      await cheatCodes.evmMine();

      const feeCaps = await gasUtils['getFeeCaps']();

      // Max fee should be capped at 500.5 gwei = 500_500_000_000 wei
      const expectedMaxGwei = BigInt(Math.trunc(500.5 * Number(WEI_CONST)));
      expect(feeCaps.maxFeePerGas).toBe(expectedMaxGwei);
      expect(feeCaps.maxFeePerGas).toBe(500_500_000_000n);

      // Test with more complex fractional value (123.456789 gwei)
      gasUtils.updateConfig({
        ...defaultL1TxUtilsConfig,
        maxGwei: 123.456789,
      });

      const feeCaps2 = await gasUtils['getFeeCaps']();

      // Should cap at 123.456789 gwei = 123_456_789_000 wei
      const expectedMaxGwei2 = BigInt(Math.trunc(123.456789 * Number(WEI_CONST)));
      expect(feeCaps2.maxFeePerGas).toBe(expectedMaxGwei2);
      expect(feeCaps2.maxFeePerGas).toBe(123_456_789_000n);
    });

    it('handles maxBlobGwei with fractional part', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock the getBlobBaseFee to return our high value
      const originalGetBlobBaseFee = l1Client.getBlobBaseFee;

      // Test with a fractional maxBlobGwei (100.5 gwei)
      // Set stallTimeMs to 0 to avoid stall-time bumps in this test
      gasUtils.updateConfig({
        ...defaultL1TxUtilsConfig,
        maxBlobGwei: 100.5,
        stallTimeMs: 0,
      });

      try {
        // Mock high blob base fee to trigger the max cap (200 gwei > 100.5 gwei cap)
        l1Client.getBlobBaseFee = () => Promise.resolve(WEI_CONST * 200n);

        const feeCaps = await gasUtils['getFeeCaps'](undefined, true);

        // Max blob fee should be capped at 100.5 gwei = 100_500_000_000 wei
        const expectedMaxBlobGwei = BigInt(Math.trunc(100.5 * Number(WEI_CONST)));
        expect(feeCaps.maxFeePerBlobGas).toBe(expectedMaxBlobGwei);
        expect(feeCaps.maxFeePerBlobGas).toBe(100_500_000_000n);

        // Test with more complex fractional value (250.123456 gwei)
        gasUtils.updateConfig({
          ...defaultL1TxUtilsConfig,
          maxBlobGwei: 250.123456,
          stallTimeMs: 0,
        });

        // Use higher base fee to trigger this cap (300 gwei > 250.123456 gwei cap)
        l1Client.getBlobBaseFee = () => Promise.resolve(WEI_CONST * 300n);

        const feeCaps2 = await gasUtils['getFeeCaps'](undefined, true);

        // Should cap at 250.123456 gwei = 250_123_456_000 wei
        const expectedMaxBlobGwei2 = BigInt(Math.trunc(250.123456 * Number(WEI_CONST)));
        expect(feeCaps2.maxFeePerBlobGas).toBe(expectedMaxBlobGwei2);
        expect(feeCaps2.maxFeePerBlobGas).toBe(250_123_456_000n);
      } finally {
        // Restore original method
        l1Client.getBlobBaseFee = originalGetBlobBaseFee;
      }
    });

    it('respects minimum gas price bump for replacements', async () => {
      gasUtils.updateConfig({
        ...defaultL1TxUtilsConfig,
        priorityFeeRetryBumpPercentage: 5, // Set lower than minimum 10%
      });

      const initialFeeCaps = await gasUtils['getFeeCaps']();

      // Get retry gas price with attempt = 1
      const retryFeeCaps = await gasUtils['getFeeCaps'](undefined, false, 1, initialFeeCaps);

      // Should use 10% minimum bump even though config specified 5%
      const expectedPriorityFee = (initialFeeCaps.maxPriorityFeePerGas * 110n) / 100n;
      const expectedMaxFee = (initialFeeCaps.maxFeePerGas * 110n) / 100n;

      expect(retryFeeCaps.maxPriorityFeePerGas).toBe(expectedPriorityFee);
      expect(retryFeeCaps.maxFeePerGas).toBe(expectedMaxFee);
    });

    it('uses competitive fee from pending txs and fee history on retry attempts', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock pending block with transactions having higher fees
      const originalGetBlock = l1Client.getBlock;
      const mockPendingFee = WEI_CONST * 3n; // 3 gwei pending txs
      l1Client.getBlock = ((params: any) => {
        if (params?.blockTag === 'pending') {
          return Promise.resolve({
            transactions: [
              { maxPriorityFeePerGas: WEI_CONST }, // 1 gwei
              { maxPriorityFeePerGas: WEI_CONST * 2n }, // 2 gwei
              { maxPriorityFeePerGas: mockPendingFee }, // 3 gwei
              { maxPriorityFeePerGas: WEI_CONST * 4n }, // 4 gwei (outlier)
            ],
          } as any);
        }
        return originalGetBlock(params);
      }) as any;

      // Mock fee history to return moderate fees
      const originalGetFeeHistory = l1Client.getFeeHistory;
      const mockHistoricalFee = WEI_CONST * 2n; // 2 gwei (lower than pending)
      l1Client.getFeeHistory = () =>
        Promise.resolve({
          baseFeePerGas: [WEI_CONST],
          gasUsedRatio: [0.5],
          oldestBlock: 1n,
          reward: [
            [WEI_CONST / 2n, WEI_CONST, mockHistoricalFee], // 25th, 50th, 75th percentile
          ],
        } as any);

      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(WEI_CONST); // 1 gwei

      try {
        const initialFeeCaps = await gasUtils['getFeeCaps']();

        // Get retry gas price - should use competitive fee from pending (3 gwei at 75th percentile)
        const retryFeeCaps = await gasUtils['getFeeCaps'](undefined, false, 1, initialFeeCaps);

        // Competitive fee should be: max(network=1gwei, historical=2gwei, pending=3gwei) = 3gwei, then bumped by 50%
        const expectedCompetitiveFee = (mockPendingFee * 150n) / 100n; // 4.5 gwei

        // The minimum bump from initial would be initialPriority * 1.5
        const minBump = (initialFeeCaps.maxPriorityFeePerGas * 150n) / 100n;

        // Final should be max of competitive and minimum bump
        const expectedPriorityFee = expectedCompetitiveFee > minBump ? expectedCompetitiveFee : minBump;

        expect(retryFeeCaps.maxPriorityFeePerGas).toBeGreaterThanOrEqual(expectedPriorityFee);
      } finally {
        // Restore original methods
        l1Client.getBlock = originalGetBlock;
        l1Client.getFeeHistory = originalGetFeeHistory;
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('falls back to network estimate when fee history is unavailable', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      // Mock fee history to throw an error (simulating unsupported RPC method)
      const originalGetFeeHistory = l1Client.getFeeHistory;
      l1Client.getFeeHistory = () => Promise.reject(new Error('Method not supported'));

      const originalEstimate = l1Client.estimateMaxPriorityFeePerGas;
      const mockBasePriorityFee = WEI_CONST * 2n; // 2 gwei
      l1Client.estimateMaxPriorityFeePerGas = () => Promise.resolve(mockBasePriorityFee);

      try {
        const initialFeeCaps = await gasUtils['getFeeCaps']();

        // Get retry gas price - should fallback to network estimate when fee history fails
        const retryFeeCaps = await gasUtils['getFeeCaps'](undefined, false, 1, initialFeeCaps);

        // Should still get a valid price using network estimate fallback
        expect(retryFeeCaps.maxPriorityFeePerGas).toBeGreaterThan(0n);
        expect(retryFeeCaps.maxFeePerGas).toBeGreaterThan(0n);

        // Should be at least the minimum bump
        const minBump = (initialFeeCaps.maxPriorityFeePerGas * 150n) / 100n;
        expect(retryFeeCaps.maxPriorityFeePerGas).toBeGreaterThanOrEqual(minBump);
      } finally {
        // Restore original methods
        l1Client.getFeeHistory = originalGetFeeHistory;
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('adds correct buffer to gas estimation', async () => {
      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      };

      const baseEstimate = await l1Client.estimateGas(request);
      const bufferedEstimate = await gasUtils.estimateGas(l1Client.account!, request);

      // adds 20% buffer
      const expectedEstimate = baseEstimate + (baseEstimate * 20n) / 100n;
      expect(bufferedEstimate).toBe(expectedEstimate);
    });

    it('correctly handles transactions with blobs', async () => {
      // Create a sample blob
      const blobData = new Uint8Array(131072).fill(1); // 128KB blob
      const kzg = Blob.getViemKzgInstance();

      const { receipt } = await gasUtils.sendAndMonitorTransaction(
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
        undefined,
        {
          blobs: [blobData],
          kzg,
          maxFeePerBlobGas: 10000000000n, // 10 gwei
        },
      );

      expect(receipt.status).toBe('success');
      expect(receipt.blobGasUsed).toBeDefined();
      expect(receipt.blobGasPrice).toBeDefined();
    }, 20_000);

    it('estimates gas correctly for blob transactions', async () => {
      // Create a sample blob
      const blobData = new Uint8Array(131072).fill(1); // 128KB blob
      const kzg = Blob.getViemKzgInstance();

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      };

      // Estimate gas without blobs first
      const baseEstimate = await gasUtils.estimateGas(l1Client.account!, request);

      // Estimate gas with blobs
      const blobEstimate = await gasUtils.estimateGas(l1Client.account!, request, undefined, {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 10000000000n,
      });
      // Blob transactions should require more gas
      expect(blobEstimate).toBeGreaterThan(baseEstimate);
    }, 20_000);

    it('formats eth node errors correctly', async () => {
      // Set base fee extremely high to trigger error
      const extremelyHighBaseFee = WEI_CONST * 1_000_000n; // 1M gwei
      await cheatCodes.setNextBlockBaseFeePerGas(extremelyHighBaseFee);
      await cheatCodes.evmMine();

      try {
        await gasUtils.sendAndMonitorTransaction({
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        });
        fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain('L1 RPC request failed');

        const rpcError = getErrorCause(err, RpcRequestError);
        expect(rpcError?.details).toContain('max fee per gas less than block base fee');

        const metaMessages = rpcError?.metaMessages?.join('\n') ?? '';
        expect(metaMessages).toContain('eth_sendRawTransaction');
      }
    }, 10_000);

    it('strips ABI from non-revert errors', async () => {
      // Create a client with an invalid RPC URL to trigger a real error
      const invalidClient = createPublicClient({
        transport: http('https://foobar.com', { batch: false }),
        chain: foundry,
      });

      // Define a test ABI to have something to look for
      const testAbi = [
        {
          type: 'function',
          name: 'uniqueTestFunction',
          inputs: [{ type: 'uint256', name: 'param1' }],
          outputs: [{ type: 'bool' }],
          stateMutability: 'view',
        },
      ] as const;

      try {
        // Try to make a request that will fail
        await invalidClient.readContract({
          address: '0x1234567890123456789012345678901234567890',
          abi: testAbi,
          functionName: 'uniqueTestFunction',
          args: [123n],
        });

        fail('Should have thrown an error');
      } catch (err: any) {
        // Verify the original error has the ABI
        const originalError = jsonStringify(err);
        expect(originalError).toContain('uniqueTestFunction');

        // Check that the formatted error doesn't have the ABI
        const formatted = formatViemError(err);
        const serialized = jsonStringify(formatted);
        expect(serialized).not.toContain('uniqueTestFunction');
        expect(formatted.message).toContain('failed');
      }
    }, 10_000);

    it('handles custom errors in simulation and receipts', async () => {
      // We're deploying this contract:
      // pragma solidity >=0.8.27;

      // library Errors {
      //     error Test_Error(uint256 val);
      // }

      // contract TestContract {
      //     function triggerError(uint256 num) external pure {
      //         require(false, Errors.Test_Error(num));
      //     }
      // }
      const abi: Abi = [
        {
          inputs: [{ internalType: 'uint256', name: 'val', type: 'uint256' }],
          name: 'Test_Error',
          type: 'error',
        },
        {
          inputs: [{ internalType: 'uint256', name: 'num', type: 'uint256' }],
          name: 'triggerError',
          outputs: [],
          stateMutability: 'pure',
          type: 'function',
        },
      ];

      const bytecode =
        '0x6080604052348015600e575f5ffd5b506101508061001c5f395ff3fe608060405234801561000f575f5ffd5b5060043610610029575f3560e01c80638291d6871461002d575b5f5ffd5b610047600480360381019061004291906100c7565b610049565b005b5f819061008c576040517fcdae48f50000000000000000000000000000000000000000000000000000000081526004016100839190610101565b60405180910390fd5b5050565b5f5ffd5b5f819050919050565b6100a681610094565b81146100b0575f5ffd5b50565b5f813590506100c18161009d565b92915050565b5f602082840312156100dc576100db610090565b5b5f6100e9848285016100b3565b91505092915050565b6100fb81610094565b82525050565b5f6020820190506101145f8301846100f2565b9291505056fea264697066735822122011972815480b23be1e371aa7c11caa30281e61b164209ae84edcd3fee026278364736f6c634300081b0033';

      const deployHash = await l1Client.deployContract({ abi, bytecode });
      const { contractAddress: address } = await l1Client.waitForTransactionReceipt({ hash: deployHash });
      assert(address, 'No contract address');
      const request: L1TxRequest = {
        to: address,
        data: encodeFunctionData({ abi, functionName: 'triggerError', args: [33] }),
        value: 0n,
      };

      // Test that simulation throws and returns the error message
      try {
        await gasUtils.simulate(request, undefined, undefined, abi);
      } catch (err: any) {
        const { message } = formatViemError(err, abi);
        expect(message).toContain('Test_Error(33)');
      }

      // Test that we can send and monitor a tx that reverts if we skip simulation
      const result = await gasUtils.sendAndMonitorTransaction(request, { gasLimit: 100_000n });
      expect(gasUtils.state).toBe(TxUtilsState.MINED);
      expect(result.receipt.status).toBe('reverted');
    });

    it('does not consume nonce when transaction times out before sending', async () => {
      // first send a transaction to advance the nonce
      await gasUtils.sendAndMonitorTransaction(request);
      // Get the expected nonce before any transaction
      const expectedNonce = await l1Client.getTransactionCount({ address: l1Client.account.address });

      // Try to send with an already-expired timeout (epoch 0 is well in the past)
      const pastTimeout = new Date(0);
      await expect(gasUtils.sendTransaction(request, { txTimeoutAt: pastTimeout })).rejects.toThrow(
        /timed out before sending/,
      );

      // The next transaction should use the same nonce (not skip one due to a leaked consume)
      const { state } = await gasUtils.sendTransaction(request);
      expect(state.nonce).toBe(expectedNonce);
    }, 10_000);

    it('stops trying after timeout once block is mined', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      const now = dateProvider.nowInSeconds() * 1000;
      const txTimeoutAt = new Date(now + 1000);
      const txRequest: L1TxRequest = { to: '0x1234567890123456789012345678901234567890', data: '0x', value: 0n };
      const { txHash, state } = await gasUtils.sendTransaction(txRequest);
      const testState: L1TxState = { ...state, txConfigOverrides: { ...state.txConfigOverrides, txTimeoutAt } };
      // Attach the rejection handler synchronously so an early timeout does not surface as an unhandled rejection
      const monitorPromise = gasUtils.monitorTransaction(testState).catch(err => err);

      await sleep(100);
      await cheatCodes.dropTransaction(txHash);
      await cheatCodes.setNextBlockTimestamp(txTimeoutAt);
      await cheatCodes.mine();
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);
      expect(dateProvider.now() - now).toBeGreaterThanOrEqual(90);
    }, 20_000);

    it('attempts to cancel timed out transactions', async () => {
      // Disable auto-mining to control block production
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setAutomine(false);
      await cheatCodes.setBlockInterval(1);

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 1n,
      };

      // Send initial transaction
      const { txHash, state } = await gasUtils.sendTransaction(request);
      const initialTx = await l1Client.getTransaction({ hash: txHash });
      expect(gasUtils.state).toBe(TxUtilsState.SENT);
      logger.warn(`Tx ${txHash} has been sent`);

      // Try to monitor with a short timeout
      const testState: L1TxState = {
        ...state,
        txConfigOverrides: { ...state.txConfigOverrides, txTimeoutMs: 100 },
      };
      // Attach the rejection handler synchronously so an early timeout does not surface as an unhandled rejection
      const monitorPromise = gasUtils.monitorTransaction(testState).catch(err => err);
      logger.warn(`Monitoring tx ${txHash}`);

      // Mine a block to advance the timestamp and trigger the timeout
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout and catch the error
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);
      logger.warn(`Tx monitor has timed out`);

      // Wait for cancellation tx to be sent
      await sleep(100);

      // Get the nonce that was used
      const nonce = initialTx.nonce;

      // Get pending transactions
      const pendingBlock = await l1Client.getBlock({ blockTag: 'pending' });
      const pendingTxHash = pendingBlock.transactions[0];
      const cancelTx = await l1Client.getTransaction({ hash: pendingTxHash });
      logger.warn(`Got cancel tx ${pendingTxHash}`);

      // Verify cancellation tx
      expect(cancelTx).toBeDefined();
      expect(cancelTx!.to!.toLowerCase()).toBe(l1Client.account.address.toLowerCase());
      expect(cancelTx!.value).toBe(0n);
      expect(cancelTx!.input).toBe('0x');
      expect(cancelTx!.nonce).toBe(nonce);
      expect(cancelTx!.maxFeePerGas).toBeGreaterThan(initialTx.maxFeePerGas!);
      expect(cancelTx!.maxPriorityFeePerGas).toBeGreaterThan(initialTx.maxPriorityFeePerGas!);
      expect(cancelTx!.gas).toBe(21000n);
      // Non-blob cancellation should not have blob data
      expect(cancelTx!.blobVersionedHashes).toBeUndefined();
      expect(cancelTx!.maxFeePerBlobGas).toBeUndefined();

      // Mine a block to process the cancellation
      await cheatCodes.evmMine();

      // Verify the original transaction is no longer present
      await expect(l1Client.getTransaction({ hash: txHash })).rejects.toThrow();
    }, 10_000);

    it('monitors all sent txs', async () => {
      // Disable auto-mining to control block production
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setAutomine(false);
      await cheatCodes.setBlockInterval(1);

      const originalSendRawTransaction = l1Client.sendRawTransaction;
      let cancellationSent = false;
      let txBeingSigned: TransactionSerializable | undefined = undefined;

      const sentTxs: Map<Hex, TransactionSerializable> = new Map();

      // We need to intercept the call to send a transaction to L1.
      // We let the first one through but no more.
      // This blocks any cancellations
      using _1 = jest
        .spyOn(l1Client, 'sendRawTransaction')
        .mockImplementationOnce(async arg => {
          // This is the actual transaction
          const sentTx = { ...txBeingSigned! };
          const hash = await originalSendRawTransaction.call(this, arg);
          sentTxs.set(hash, sentTx);
          return hash;
        })
        .mockImplementation(_arg => {
          // Do nothing, there are any/all cancellations
          const sentTx = txBeingSigned!;
          const hash = randomBytes(32).toString('hex') as Hex;
          sentTxs.set(hash, sentTx);
          cancellationSent = true;
          return Promise.resolve(hash);
        });

      // Return the previously signed/sent transaction. We use a cache here as cancels are not sent to Anvil
      using _2 = jest
        .spyOn(l1Client, 'getTransaction')
        .mockImplementation((arg: GetTransactionParameters<BlockTag>) => {
          // Do nothing
          const tx = sentTxs.get(arg.hash!);
          return Promise.resolve(tx as any);
        });

      // We need to capture the transactions at the point of being signed otherwise there is no nonce!
      const originalSign = l1Client.signTransaction;

      using _3 = jest.spyOn(l1Client, 'signTransaction').mockImplementation((arg: any) => {
        txBeingSigned = arg;
        return originalSign(txBeingSigned as any);
      });

      // Send initial transaction
      const { state } = await gasUtils.sendTransaction(request);
      expect(gasUtils.state).toBe(TxUtilsState.SENT);
      logger.warn('Tx has been sent');

      // Monitor the tx. We will think it has timed out and submit a cancellation.
      state.txConfigOverrides.txTimeoutMs = 200;
      state.txConfigOverrides.checkIntervalMs = 100;
      // Attach the rejection handler synchronously so an early timeout does not surface as an unhandled rejection
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Wait for timeout and catch the error
      await sleep(100);
      await cheatCodes.mineEmptyBlock();
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);
      logger.warn('Monitor has thrown for timeout');

      // Wait for cancellation to be sent
      await sleep(100);

      // Cancellation should have been sent, but will have been dropped
      expect(cancellationSent).toBeTruthy();
      logger.warn('Cancellation has been sent');

      // Now we mine a block, this should mine the tx that 'timed out'
      await cheatCodes.evmMine();
      logger.warn('Block has been mined');

      await retryFastUntil(() => gasUtils.state === TxUtilsState.MINED, 'Waiting for mined status');
      logger.warn('Tx is now mined according to monitor');

      // Although the monitoring threw that the tx timed out. Internally it should have recognized that the tx was mined
      expect(gasUtils.state).toBe(TxUtilsState.MINED);
    }, 10_000);

    it('attempts to cancel timed out blob transactions with correct parameters', async () => {
      // Disable auto-mining to control block production
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Create blob data
      const blobData = new Uint8Array(131072).fill(1);
      const kzg = Blob.getViemKzgInstance();

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      };

      // Send initial blob transaction
      const { txHash, state } = await gasUtils.sendTransaction(request, undefined, {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 100n * WEI_CONST, // 100 gwei
      });
      const initialTx = await l1Client.getTransaction({ hash: txHash });
      logger.warn('Initial blob tx has been sent', { txHash });

      // Try to monitor with a short timeout
      state.txConfigOverrides.txTimeoutMs = 200;
      state.txConfigOverrides.checkIntervalMs = 100;
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Wait for timeout and catch the error
      await sleep(100);
      await cheatCodes.mineEmptyBlock();
      logger.warn('Awaiting for tx to time out');
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);
      logger.warn('Tx has timed out');

      // Wait for cancellation tx to be sent
      await sleep(500);

      // Get the nonce that was used
      const nonce = initialTx.nonce;

      // Get pending transactions
      logger.warn('Trying to get cancel tx');
      const cancelTx = await retryUntil(
        async () => {
          const pendingBlock = await l1Client.getBlock({ blockTag: 'pending' });
          const pendingTxHash = pendingBlock.transactions[0];
          return pendingTxHash && l1Client.getTransaction({ hash: pendingTxHash }).catch(() => undefined);
        },
        'get cancel tx',
        5,
        0.1,
      );

      // Verify cancellation tx
      expect(cancelTx).toBeDefined();
      expect(cancelTx!.nonce).toBe(nonce);
      expect(cancelTx!.to!.toLowerCase()).toBe(l1Client.account.address.toLowerCase());
      expect(cancelTx!.value).toBe(0n);
      expect(cancelTx!.input).toBe('0x');
      expect(cancelTx!.maxFeePerGas).toBeGreaterThan(initialTx.maxFeePerGas!);
      expect(cancelTx!.maxPriorityFeePerGas).toBeGreaterThan(initialTx.maxPriorityFeePerGas!);
      // Blob cancellation should have blob gas and blob hashes
      expect(cancelTx!.maxFeePerBlobGas).toBeGreaterThan(initialTx.maxFeePerBlobGas!);
      expect(cancelTx!.blobVersionedHashes).toBeDefined();
      expect(cancelTx!.blobVersionedHashes!.length).toBe(1);

      // Mine a block to process the cancellation
      await cheatCodes.evmMine();

      // Verify the original transaction is no longer present and the cancellation was mined
      await expect(l1Client.getTransaction({ hash: txHash })).rejects.toThrow(TransactionNotFoundError);
      expect(await l1Client.getTransactionReceipt({ hash: cancelTx!.hash })).toBeDefined();
      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'wait mined', 2, 0.1);
    }, 20_000);

    it('does not attempt to cancel a timed out tx when cancelTxOnTimeout is false', async () => {
      // Disable auto-mining to control block production
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      const request = {
        to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        data: '0x' as `0x${string}`,
        value: 0n,
      };

      const { txHash, state } = await gasUtils.sendTransaction(request);
      const initialTx = await l1Client.getTransaction({ hash: txHash });

      // monitor with a short timeout and cancellation disabled
      const now = dateProvider.nowInSeconds() * 1000;
      const txTimeoutAt = new Date(now + 200);
      state.txConfigOverrides.txTimeoutMs = 200;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.cancelTxOnTimeout = false;
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Drop the transaction and advance the block timestamp to trigger the timeout
      await sleep(50);
      await cheatCodes.dropTransaction(txHash);
      await cheatCodes.setNextBlockTimestamp(txTimeoutAt);

      // Mine several blocks to ensure the monitoring loop checks the timeout
      for (let i = 0; i < 5; i++) {
        await cheatCodes.mine();
        await sleep(20);
      }

      // Wait for timeout and catch the error
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Ensure no txs were sent
      const nonce = await l1Client.getTransactionCount({ blockTag: 'pending', address: l1Client.account.address });
      expect(nonce).toBe(initialTx.nonce);
    }, 20_000);

    it('detects when nonce is mined by unknown transaction', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      // Send initial transaction
      const { txHash, state } = await gasUtils.sendTransaction(request);
      const nonce = state.nonce;
      logger.warn('Initial tx sent', { txHash, nonce });

      // Drop the original transaction
      await cheatCodes.dropTransaction(txHash);

      // Send a different transaction with the same nonce (simulating external replacement)
      const replacementHash = await l1Client.sendTransaction({
        ...request,
        to: '0x9876543210987654321098765432109876543210', // Different address
        nonce,
        gas: 30000n,
        maxFeePerGas: WEI_CONST * 10n,
        maxPriorityFeePerGas: WEI_CONST,
      });

      logger.warn('Replacement tx sent', { replacementHash, nonce });

      // Mine the replacement
      await cheatCodes.evmMine();
      await retryUntil(
        () => l1Client.getTransactionReceipt({ hash: replacementHash }).catch(() => undefined),
        'replacement',
        2,
        0.1,
      );

      // Monitor should detect the nonce was mined but throw UnknownMinedTxError
      await expect(gasUtils.monitorTransaction(state)).rejects.toThrow(UnknownMinedTxError);
      expect(gasUtils.state).toBe(TxUtilsState.MINED);
    }, 10_000);

    it('transitions from sent to mined', async () => {
      // Initially IDLE
      expect(gasUtils.state).toBe(TxUtilsState.IDLE);

      // Send transaction - should become SENT
      const { state } = await gasUtils.sendTransaction(request);
      expect(gasUtils.state).toBe(TxUtilsState.SENT);
      expect(state.status).toBe(TxUtilsState.SENT);

      // Monitor and wait for mining
      await gasUtils.monitorTransaction(state);

      // Should be MINED
      expect(gasUtils.state).toBe(TxUtilsState.MINED);
      expect(state.status).toBe(TxUtilsState.MINED);
      expect(state.receipt).toBeDefined();
      expect(state.receipt!.status).toBe('success');

      // Verify metrics were recorded
      expect(metrics.recordMinedTx).toHaveBeenCalledTimes(1);
      expect(metrics.recordMinedTx).toHaveBeenCalledWith(state, expect.any(Date));
      expect(metrics.recordDroppedTx).not.toHaveBeenCalled();
    }, 10_000);

    it('transitions from sent to speed_up to mined', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.stallTimeMs = 24_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.txTimeoutMs = 72_000;

      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      // Start monitoring
      const monitorPromise = gasUtils.monitorTransaction(state);

      // Mine an empty block, should not be enough to trigger speed-up
      await cheatCodes.mineEmptyBlock();
      await sleep(500);
      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      // But now yes
      await cheatCodes.mineEmptyBlock();
      await retryFastUntil(() => gasUtils.state === TxUtilsState.SPEED_UP, 'wait for speed-up');
      expect(state.txHashes.length).toBeGreaterThan(1);

      // Wait for completion
      await cheatCodes.mine();
      await monitorPromise;

      expect(gasUtils.state).toBe(TxUtilsState.MINED);
      expect(state.status).toBe(TxUtilsState.MINED);
      expect(state.receipt).toBeDefined();
    }, 10_000);

    it('handles dropped cancellation transaction', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Send tx that will timeout
      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.txTimeoutMs = 12_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.txUnseenConsideredDroppedMs = 24_000;
      state.txConfigOverrides.stallTimeMs = 36_000; // no speed-ups

      // Monitor (will timeout and send cancel)
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger timeout
      await sleep(100);
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Wait for cancellation to be sent
      await retryUntil(() => state.cancelTxHashes.length > 0, 'cancel sent', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);
      const [cancelTxHash] = state.cancelTxHashes;
      logger.warn('Cancel tx sent', { cancelTxHash });

      // Drop the cancellation tx as well
      await cheatCodes.dropTransaction(cancelTxHash);

      // After a while the cancellation should be considered dropped
      await cheatCodes.mine();
      await sleep(500);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);
      await cheatCodes.mine();
      await retryUntil(() => gasUtils.state === TxUtilsState.NOT_MINED, 'cancel dropped', 20, 0.1);

      // And a new tx should be able to be sent taking the same nonce
      const { state: newState } = await gasUtils.sendTransaction({ ...request, value: 5n });
      const monitorPromise2 = gasUtils.monitorTransaction(newState).catch(err => err);
      expect(newState.nonce).toEqual(state.nonce);

      // And mined
      await cheatCodes.mine();
      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'new tx mined', 20, 0.1);
      const receipt = await monitorPromise2;
      expect(newState.receipt).toEqual(receipt);
      expect(newState.receipt!.status).toBe('success');
    }, 10_000);

    it('handles not-mined cancellation transaction', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Send tx that will timeout
      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.txTimeoutMs = 12_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.maxSpeedUpAttempts = 1;
      state.txConfigOverrides.stallTimeMs = 24_000; // We'll speed up cancellation once
      state.txConfigOverrides.txCancellationFinalTimeoutMs = 24_000;

      // Monitor (will timeout and send cancel)
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger timeout
      await sleep(100);
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Wait for cancellation to be sent
      await retryUntil(() => state.cancelTxHashes.length > 0, 'cancel sent', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);
      const [cancelTxHash] = state.cancelTxHashes;
      logger.warn('Cancel tx sent', { cancelTxHash });

      // After a while we give up on the cancellation
      // First two L1 blocks will trigger speed up
      await cheatCodes.mineEmptyBlock(2);
      await retryUntil(() => state.cancelTxHashes.length > 1, 'cancel speed up', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);

      // Verify the sped-up cancellation tx has no data and no value
      const speedUpCancelTxHash = state.cancelTxHashes[1];
      const speedUpCancelTx = await l1Client.getTransaction({ hash: speedUpCancelTxHash });
      expect(speedUpCancelTxHash).not.toBe(cancelTxHash);
      expect(speedUpCancelTx.input).toBe('0x');
      expect(speedUpCancelTx.value).toBe(0n);

      // Another one no changes
      await cheatCodes.mineEmptyBlock();
      await sleep(500);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);

      // And the last one will cause the final time out
      await cheatCodes.mineEmptyBlock();
      logger.warn('Waiting for cancel to be considered not-mined');
      await retryUntil(() => gasUtils.state === TxUtilsState.NOT_MINED, 'cancel not mined', 20, 0.1);

      // A new tx should be able to be sent taking the following nonce
      const { state: newState } = await gasUtils.sendTransaction({ ...request, value: 5n });
      const monitorPromise2 = gasUtils.monitorTransaction(newState).catch(err => err);
      expect(newState.nonce).toEqual(state.nonce + 1);

      // And mined, along with the previous cancellation
      await cheatCodes.mine();
      await cheatCodes.mine();
      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'new tx mined', 20, 0.1);
      const receipt = await monitorPromise2;
      expect(newState.receipt).toEqual(receipt);
      expect(newState.receipt!.status).toBe('success');
    }, 10_000);

    it('ensures block gas limit is set when using MAX_L1_TX_LIMIT', async () => {
      let capturedBlockOverrides: any = {};
      const originalSimulate = gasUtils['_simulate'].bind(gasUtils);

      const spy = jest
        .spyOn(gasUtils as any, '_simulate')
        .mockImplementation((call: any, blockOverrides: any, stateOverrides: any, gasConfig: any, abi: any) => {
          capturedBlockOverrides = blockOverrides;
          return originalSimulate(call, blockOverrides, stateOverrides, gasConfig, abi);
        });

      try {
        // Test with ensureBlockGasLimit: true (default)
        await gasUtils.simulate(request, {}, [], undefined, { ignoreBlockGasLimit: false });
        expect(capturedBlockOverrides.gasLimit).toBe(MAX_L1_TX_LIMIT);

        // Test with ensureBlockGasLimit: false
        capturedBlockOverrides = {};
        await gasUtils.simulate(request, {}, [], undefined, { ignoreBlockGasLimit: true });
        expect(capturedBlockOverrides.gasLimit).toBeUndefined();

        // Test with explicit gas in request
        capturedBlockOverrides = {};
        await gasUtils.simulate({ ...request, gas: 1_000_000n }, {}, [], undefined, { ignoreBlockGasLimit: false });
        expect(capturedBlockOverrides.gasLimit).toBeUndefined();
      } finally {
        spy.mockRestore();
      }
    });

    it('ensures block gas limit is set when using MAX_L1_TX_LIMIT with custom block overrides', async () => {
      let capturedBlockOverrides: any = {};
      const originalSimulate = gasUtils['_simulate'].bind(gasUtils);

      const spy = jest
        .spyOn(gasUtils as any, '_simulate')
        .mockImplementation((call: any, blockOverrides: any, stateOverrides: any, gasConfig: any, abi: any) => {
          capturedBlockOverrides = blockOverrides;
          return originalSimulate(call, blockOverrides, stateOverrides, gasConfig, abi);
        });

      try {
        // Test with custom block overrides and ensureBlockGasLimit: true
        const myCustomBlockOverrides = { baseFeePerGas: 1000000000n };
        await gasUtils.simulate(request, myCustomBlockOverrides, [], undefined, { ignoreBlockGasLimit: false });

        // Verify that block gas limit is set while preserving custom overrides
        expect(capturedBlockOverrides.gasLimit).toBe(MAX_L1_TX_LIMIT);
        expect(capturedBlockOverrides.baseFeePerGas).toBe(1000000000n);
      } finally {
        spy.mockRestore();
      }
    });

    it('transitions from sent to not-mined when tx drops without cancellation', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Send transaction with cancelTxOnTimeout: false
      const { txHash, state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.txTimeoutMs = 12_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.cancelTxOnTimeout = false;

      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      // Monitor the tx
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Drop the transaction from mempool
      await sleep(50);
      await cheatCodes.dropTransaction(txHash);

      // Mine a block to trigger timeout
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Verify state transitions to NOT_MINED
      await retryUntil(() => gasUtils.state === TxUtilsState.NOT_MINED, 'wait not-mined', 20, 0.1);

      // Verify metrics were recorded for dropped tx
      expect(metrics.recordDroppedTx).toHaveBeenCalledTimes(1);
      expect(metrics.recordDroppedTx).toHaveBeenCalledWith(state);
      expect(metrics.recordMinedTx).not.toHaveBeenCalled();

      // Verify nonce manager is reset (new tx can reuse same nonce)
      const { state: newState } = await gasUtils.sendTransaction({ ...request, value: 3n });
      expect(newState.nonce).toEqual(state.nonce);

      // Mine and verify new tx succeeds
      const monitorPromise2 = gasUtils.monitorTransaction(newState);
      await cheatCodes.mine();
      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'new tx mined', 20, 0.1);
      const receipt = await monitorPromise2;
      expect(receipt.status).toBe('success');
    }, 10_000);

    it('transitions from speed-up to not-mined on timeout', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Send transaction
      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.stallTimeMs = 24_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.txTimeoutMs = 60_000;
      state.txConfigOverrides.cancelTxOnTimeout = false;
      // Limit to 1 speed-up to prevent a second speed-up from firing between the test dropping
      // txs and the timeout, which would re-add a pending tx to the mempool and corrupt the nonce.
      state.txConfigOverrides.maxSpeedUpAttempts = 1;

      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      // Start monitoring
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger speed-up
      await cheatCodes.mineEmptyBlock();
      await sleep(200);
      await cheatCodes.mineEmptyBlock();
      await retryUntil(() => gasUtils.state === TxUtilsState.SPEED_UP, 'wait for speed-up', 20, 0.1);
      expect(state.txHashes.length).toBeGreaterThan(1);

      // Drop all tx hashes after speed-up
      for (const hash of state.txHashes) {
        await cheatCodes.dropTransaction(hash);
      }

      // Continue with timeout - mine more blocks to trigger timeout
      await cheatCodes.mineEmptyBlock(3);

      // Wait for timeout
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Verify state goes to NOT_MINED
      await retryUntil(() => gasUtils.state === TxUtilsState.NOT_MINED, 'wait not-mined', 20, 0.1);

      // Verify nonce manager reset - new tx can reuse nonce
      const { state: newState } = await gasUtils.sendTransaction({ ...request, value: 4n });
      expect(newState.nonce).toEqual(state.nonce);
    }, 15_000);

    it('reaches max speed-up attempts and continues waiting', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Set max speed-up attempts to 2, short stall time
      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.maxSpeedUpAttempts = 2;
      state.txConfigOverrides.stallTimeMs = 24_000;
      state.txConfigOverrides.checkIntervalMs = 100;
      state.txConfigOverrides.txTimeoutMs = 96_000; // Long enough to allow speed-ups
      state.txConfigOverrides.cancelTxOnTimeout = false;

      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      // Start monitoring
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger first speed-up (attempt 1)
      await cheatCodes.mineEmptyBlock(2);
      await retryUntil(() => state.txHashes.length === 2, 'first speed-up', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.SPEED_UP);

      // Trigger second speed-up (attempt 2)
      await cheatCodes.mineEmptyBlock(2);
      await retryUntil(() => state.txHashes.length === 3, 'second speed-up', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.SPEED_UP);

      // Try to trigger third speed-up - should not happen (max reached)
      await cheatCodes.mineEmptyBlock(2);
      await sleep(500);
      expect(state.txHashes.length).toBe(3); // No new speed-up

      // Continue mining to trigger timeout
      await cheatCodes.mineEmptyBlock(2);

      // Eventually timeout to NOT_MINED
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);
      await retryUntil(() => gasUtils.state === TxUtilsState.NOT_MINED, 'wait not-mined', 20, 0.1);
    }, 15_000);

    it('handles interruption during SENT state', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      const { txHash, state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.checkIntervalMs = 100;
      expect(gasUtils.state).toBe(TxUtilsState.SENT);

      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);
      await sleep(50);

      // Interrupt during SENT - monitoring should stop with TimeoutError
      gasUtils.interrupt();
      const result = await monitorPromise;
      expect(result).toBeInstanceOf(TimeoutError);

      // Clean up
      await cheatCodes.dropTransaction(txHash).catch(() => {});
      await gasUtils.waitMonitoringStopped(2);
    }, 10_000);

    it('handles interruption during SPEED_UP state', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.stallTimeMs = 24_000;
      state.txConfigOverrides.checkIntervalMs = 100;

      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger speed-up
      await cheatCodes.mineEmptyBlock(2);
      await retryUntil(() => gasUtils.state === TxUtilsState.SPEED_UP, 'wait speed-up', 20, 0.1);

      // Interrupt during SPEED_UP - monitoring should stop with TimeoutError
      gasUtils.interrupt();
      const result = await monitorPromise;
      expect(result).toBeInstanceOf(TimeoutError);

      await gasUtils.waitMonitoringStopped(2);
    }, 10_000);

    it('handles interruption during CANCELLED state', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.txTimeoutMs = 12_000;
      state.txConfigOverrides.checkIntervalMs = 100;

      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger timeout and cancellation
      await cheatCodes.mineEmptyBlock();
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Wait for cancellation to be sent (background monitoring)
      await retryUntil(() => state.cancelTxHashes.length > 0, 'cancel sent', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);

      // Interrupt during CANCELLED - this will stop the background monitoring of the cancel tx
      gasUtils.interrupt();

      // Verify interruption was effective - background monitoring should stop
      await gasUtils.waitMonitoringStopped(2);
    }, 10_000);

    it('transitions from cancelled to mined when cancellation succeeds', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setBlockInterval(12);

      // Send tx that will timeout
      const { state } = await gasUtils.sendTransaction(request);
      state.txConfigOverrides.txTimeoutMs = 12_000;
      state.txConfigOverrides.checkIntervalMs = 100;

      // Monitor (will timeout and send cancel)
      const monitorPromise = gasUtils.monitorTransaction(state).catch(err => err);

      // Trigger timeout
      await sleep(100);
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout
      await expect(monitorPromise).resolves.toBeInstanceOf(TimeoutError);

      // Wait for cancellation to be sent
      await retryUntil(() => state.cancelTxHashes.length > 0, 'cancel sent', 20, 0.1);
      expect(gasUtils.state).toBe(TxUtilsState.CANCELLED);
      const [cancelTxHash] = state.cancelTxHashes;
      logger.warn('Cancel tx sent', { cancelTxHash });

      // Mine the cancellation tx (don't drop it)
      await cheatCodes.mine();

      // Verify state goes CANCELLED -> MINED
      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'cancel mined', 20, 0.1);

      // Verify the cancel tx receipt is stored
      expect(state.receipt).toBeDefined();
      expect(state.receipt!.transactionHash).toBe(cancelTxHash);
      expect(state.receipt!.status).toBe('success');
    }, 10_000);

    it('loads state and resumes monitoring', async () => {
      // We need dynamic imports here since we do NOT depend on this projects
      // and we need to mark them as non-const so ts does not try to look for them
      const { openTmpStore } = await import('@aztec/kv-store/lmdb-v2' as string);
      const { L1TxStore } = await import('@aztec/node-lib/stores' as string);

      const kvStore = await openTmpStore('l1-tx-utils-rehydration-test', true);
      const store = new L1TxStore(kvStore);
      gasUtils.setStore(store);

      const { state } = await gasUtils.sendTransaction(request);
      const txHash = state.txHashes[0];

      // Wait until it's in SENT state
      await retryUntil(() => gasUtils.state === TxUtilsState.SENT, 'tx sent', 20, 0.1);

      // Interrupt and wait for monitoring to stop
      gasUtils.interrupt();
      await gasUtils.waitMonitoringStopped(10);

      // Create a new instance with the same store (simulating a restart)
      const recreatedUtils = createL1TxUtils();
      recreatedUtils.setStore(store);
      await recreatedUtils.loadStateAndResumeMonitoring();

      // Check that state is restored as SENT
      expect(recreatedUtils.state).toBe(TxUtilsState.SENT);
      expect(recreatedUtils.txs).toHaveLength(1);
      expect(recreatedUtils.txs[0].txHashes[0]).toBe(txHash);
      expect(recreatedUtils.txs[0].status).toBe(TxUtilsState.SENT);

      // Mine some blocks so the transaction gets mined
      await cheatCodes.evmMine();
      await cheatCodes.evmMine();

      // Wait for the rehydrated instance to detect the transaction as mined
      await retryUntil(() => recreatedUtils.state === TxUtilsState.MINED, 'tx mined after rehydration', 30, 0.1);

      // Cleanup
      await store.close();
      await kvStore.close();
    }, 15_000);
  });

  describe('L1TxUtils vs ReadOnlyL1TxUtils', () => {
    let publicClient: ViemClient;
    let walletClient: ExtendedViemWalletClient;

    beforeEach(() => {
      walletClient = l1Client;
      publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
    });

    it('ReadOnlyL1TxUtils can be instantiated with public client but not wallet methods', () => {
      const readOnlyUtils = new ReadOnlyL1TxUtils(publicClient, logger, dateProvider);
      expect(readOnlyUtils).toBeDefined();
      expect(readOnlyUtils.client).toBe(publicClient);

      // Verify wallet-specific methods are not available
      expect(readOnlyUtils).not.toHaveProperty('getSenderAddress');
      expect(readOnlyUtils).not.toHaveProperty('getSenderBalance');
      expect(readOnlyUtils).not.toHaveProperty('sendTransaction');
      expect(readOnlyUtils).not.toHaveProperty('monitorTransaction');
      expect(readOnlyUtils).not.toHaveProperty('sendAndMonitorTransaction');
    });

    it('uses fallback gas estimate when wrapped simulateBlocks error reports unsupported method', async () => {
      const readOnlyUtils = new ReadOnlyL1TxUtils(publicClient, logger, dateProvider);
      using _simulateBlocksSpy = jest.spyOn(publicClient, 'simulateBlocks').mockRejectedValue(
        new L1RpcError('L1 RPC request failed', {
          cause: new MethodNotFoundRpcError(new Error('method not found'), { method: 'eth_simulateV1' }),
        }),
      );

      await expect(
        readOnlyUtils.simulate(
          { to: '0x1234567890123456789012345678901234567890', data: '0xabcdef', value: 0n },
          undefined,
          undefined,
          undefined,
          { fallbackGasEstimate: 123n },
        ),
      ).resolves.toEqual({ gasUsed: 123n, result: '0x' });
    });

    it('L1TxUtils can be instantiated with wallet client and has write methods', () => {
      const l1TxUtils = createL1TxUtils(walletClient, { logger });
      expect(l1TxUtils).toBeDefined();
      expect(l1TxUtils.client).toBe(walletClient);

      // Verify wallet-specific methods are available
      expect(l1TxUtils.getSenderAddress).toBeDefined();
      expect(l1TxUtils.getSenderBalance).toBeDefined();
      expect(l1TxUtils.sendTransaction).toBeDefined();
      expect(l1TxUtils.sendAndMonitorTransaction).toBeDefined();
    });

    it('L1TxUtils inherits all read-only methods from ReadOnlyL1TxUtils', () => {
      const l1TxUtils = createL1TxUtils(walletClient, { logger });

      // Verify all read-only methods are available
      expect(l1TxUtils.getBlock).toBeDefined();
      expect(l1TxUtils.getBlockNumber).toBeDefined();
      expect(l1TxUtils.getFeeCaps).toBeDefined();
      expect(l1TxUtils.estimateGas).toBeDefined();
      expect(l1TxUtils.getTransactionStats).toBeDefined();
      expect(l1TxUtils.simulate).toBeDefined();
      expect(l1TxUtils.bumpGasLimit).toBeDefined();
    });

    it('L1TxUtils cannot be instantiated with public client', () => {
      expect(() => {
        createL1TxUtils(publicClient as any, { logger });
      }).toThrow();
    });
  });
});

class TestL1TxUtils extends L1TxUtils {
  declare public txs: L1TxState[];

  public setMetrics(metrics: IL1TxMetrics) {
    this.metrics = metrics;
  }

  public setStore(store: IL1TxStore) {
    this.store = store;
  }

  public addTxState(state: L1TxState) {
    this.txs.push(state);
  }

  public override monitorTransaction(state: L1TxState) {
    return super.monitorTransaction(state);
  }
}
