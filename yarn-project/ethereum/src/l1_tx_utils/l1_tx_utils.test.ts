import { Blob } from '@aztec/blob-lib';
import { randomBytes } from '@aztec/foundation/crypto';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, TestDateProvider } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';
import type { Anvil } from '@viem/anvil';
import { type MockProxy, mock } from 'jest-mock-extended';
import assert from 'node:assert';
import {
  type Abi,
  type BlockTag,
  type GetTransactionParameters,
  type Hex,
  TransactionNotFoundError,
  type TransactionSerializable,
  createPublicClient,
  encodeFunctionData,
  http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client, getPublicClient } from '../client.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import { formatViemError } from '../utils.js';
import {
  type IL1TxMetrics,
  type IL1TxStore,
  type L1TxRequest,
  type L1TxState,
  type L1TxUtilsConfig,
  ReadOnlyL1TxUtils,
  TxUtilsState,
  UnknownMinedTxError,
  createL1TxUtilsFromViemWallet,
  defaultL1TxUtilsConfig,
} from './index.js';
import { L1TxUtilsWithBlobs } from './l1_tx_utils_with_blobs.js';
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

  describe('L1TxUtilsWithBlobs', () => {
    let gasUtils: TestL1TxUtilsWithBlobs;
    let config: Partial<L1TxUtilsConfig>;

    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0xabcdef' as `0x${string}`,
      value: 1n,
    };

    const createL1TxUtils = () =>
      new TestL1TxUtilsWithBlobs(
        l1Client,
        EthAddress.fromString(l1Client.account.address),
        createViemSigner(l1Client),
        logger,
        dateProvider,
        config,
        undefined,
        undefined,
        metrics,
      );

    beforeEach(() => {
      config = {
        gasLimitBufferPercentage: 20,
        maxGwei: 500n,
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
        gasPrice: {
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
      const maxGwei = 500n;
      const newBaseFee = (maxGwei - 10n) * WEI_CONST;

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

      expect(receipt.effectiveGasPrice).toBeLessThanOrEqual(maxGwei * WEI_CONST);
    }, 60_000);

    it('adds appropriate buffer to gas estimation', async () => {
      const stableBaseFee = WEI_CONST * 10n;
      await cheatCodes.setNextBlockBaseFeePerGas(stableBaseFee);
      await cheatCodes.evmMine();

      // First deploy without any buffer
      gasUtils.updateConfig({
        gasLimitBufferPercentage: 0,
        maxGwei: 500n,
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
        maxGwei: 500n,
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
        const gasPrice = await gasUtils['getGasPrice']();

        // With default config, priority fee should be bumped by 20%
        const expectedPriorityFee = (mockBasePriorityFee * 120n) / 100n;

        // Base fee should be bumped for potential stalls (1.125^(stallTimeMs/12000) = ~1.125 for default config)
        const expectedMaxFee = (WEI_CONST * 1125n) / 1000n + expectedPriorityFee;

        expect(gasPrice.maxPriorityFeePerGas).toBe(expectedPriorityFee);
        expect(gasPrice.maxFeePerGas).toBe(expectedMaxFee);
      } finally {
        // Restore original method
        l1Client.estimateMaxPriorityFeePerGas = originalEstimate;
      }
    });

    it('calculates correct gas prices for retry attempts', async () => {
      await cheatCodes.setNextBlockBaseFeePerGas(WEI_CONST);
      await cheatCodes.evmMine();

      const initialGasPrice = await gasUtils['getGasPrice']();

      // Get retry gas price for 2nd attempt
      const retryGasPrice = await gasUtils['getGasPrice'](undefined, false, 1, initialGasPrice);

      // With default config, retry should bump fees by 50%
      const expectedPriorityFee = (initialGasPrice.maxPriorityFeePerGas * 150n) / 100n;
      const expectedMaxFee = (initialGasPrice.maxFeePerGas * 150n) / 100n;

      expect(retryGasPrice.maxPriorityFeePerGas).toBe(expectedPriorityFee);
      expect(retryGasPrice.maxFeePerGas).toBe(expectedMaxFee);
    });

    it('respects minimum gas price bump for replacements', async () => {
      gasUtils.updateConfig({
        ...defaultL1TxUtilsConfig,
        priorityFeeRetryBumpPercentage: 5, // Set lower than minimum 10%
      });

      const initialGasPrice = await gasUtils['getGasPrice']();

      // Get retry gas price with attempt = 1
      const retryGasPrice = await gasUtils['getGasPrice'](undefined, false, 1, initialGasPrice);

      // Should use 10% minimum bump even though config specified 5%
      const expectedPriorityFee = (initialGasPrice.maxPriorityFeePerGas * 110n) / 100n;
      const expectedMaxFee = (initialGasPrice.maxFeePerGas * 110n) / 100n;

      expect(retryGasPrice.maxPriorityFeePerGas).toBe(expectedPriorityFee);
      expect(retryGasPrice.maxFeePerGas).toBe(expectedMaxFee);
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
      } catch (err: any) {
        const res = err;
        const { message } = res;
        // Verify the error contains actual newlines, not escaped \n
        expect(message).not.toContain('\\n');
        expect(message.split('\n').length).toBeGreaterThan(1);

        // Check that we have the key error information
        expect(message).toContain('max fee per gas less than block base fee');

        // Check request body formatting if present
        if (message.includes('Request body:')) {
          const bodyStart = message.indexOf('Request body:');
          const body = message.slice(bodyStart);
          expect(body).toContain('eth_sendRawTransaction');

          // TODO: Fix this test. We no longer generate an error that gets truncated
          // Check params are truncated if too long
          // if (body.includes('0x')) {
          //   expect(body).toContain('...');
          // }
        }
      }
    }, 10_000);

    it('strips ABI from non-revert errors', async () => {
      // Create a client with an invalid RPC URL to trigger a real error
      const invalidClient = createPublicClient({
        transport: http('https://foobar.com'),
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

    it('stops trying after timeout once block is mined', async () => {
      await cheatCodes.setAutomine(false);
      await cheatCodes.setIntervalMining(0);

      const now = dateProvider.nowInSeconds() * 1000;
      const txTimeoutAt = new Date(now + 1000);
      const txRequest: L1TxRequest = { to: '0x1234567890123456789012345678901234567890', data: '0x', value: 0n };
      const { txHash, state } = await gasUtils.sendTransaction(txRequest);
      const testState: L1TxState = { ...state, txConfigOverrides: { ...state.txConfigOverrides, txTimeoutAt } };
      const monitorPromise = gasUtils.monitorTransaction(testState);

      await sleep(100);
      await cheatCodes.dropTransaction(txHash);
      await cheatCodes.setNextBlockTimestamp(txTimeoutAt);
      await cheatCodes.mine();
      await expect(monitorPromise).rejects.toThrow(/timed out/);
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
      const monitorPromise = gasUtils.monitorTransaction(testState);
      logger.warn(`Monitoring tx ${txHash}`);

      // Mine a block to advance the timestamp and trigger the timeout
      await cheatCodes.mineEmptyBlock();

      // Wait for timeout and catch the error
      await expect(monitorPromise).rejects.toThrow('timed out');
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
      const monitorPromise = gasUtils.monitorTransaction(state);

      // Wait for timeout and catch the error
      await sleep(100);
      await cheatCodes.mineEmptyBlock();
      await expect(monitorPromise).rejects.toThrow('timed out');
      logger.warn('Monitor has thrown for timeout');

      // Wait for cancellation to be sent
      await sleep(100);

      // Cancellation should have been sent, but will have been dropped
      expect(cancellationSent).toBeTruthy();
      logger.warn('Cancellation has been sent');

      // Now we mine a block, this should mine the tx that 'timed out'
      await cheatCodes.evmMine();
      logger.warn('Block has been mined');

      await retryUntil(() => gasUtils.state === TxUtilsState.MINED, 'Waiting for mined status', 10, 0.1);
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
      await retryUntil(() => gasUtils.state === TxUtilsState.SPEED_UP, 'wait for speed-up', 10, 0.1);
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

    it('ensures block gas limit is set when using LARGE_GAS_LIMIT', async () => {
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
        expect(capturedBlockOverrides.gasLimit).toBe(24_000_000n);

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

    it('ensures block gas limit is set when using LARGE_GAS_LIMIT with custom block overrides', async () => {
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
        expect(capturedBlockOverrides.gasLimit).toBe(24_000_000n); // 12_000_000 * 2
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

    it('L1TxUtils can be instantiated with wallet client and has write methods', () => {
      const l1TxUtils = createL1TxUtilsFromViemWallet(walletClient, { logger });
      expect(l1TxUtils).toBeDefined();
      expect(l1TxUtils.client).toBe(walletClient);

      // Verify wallet-specific methods are available
      expect(l1TxUtils.getSenderAddress).toBeDefined();
      expect(l1TxUtils.getSenderBalance).toBeDefined();
      expect(l1TxUtils.sendTransaction).toBeDefined();
      expect(l1TxUtils.sendAndMonitorTransaction).toBeDefined();
    });

    it('L1TxUtils inherits all read-only methods from ReadOnlyL1TxUtils', () => {
      const l1TxUtils = createL1TxUtilsFromViemWallet(walletClient, { logger });

      // Verify all read-only methods are available
      expect(l1TxUtils.getBlock).toBeDefined();
      expect(l1TxUtils.getBlockNumber).toBeDefined();
      expect(l1TxUtils.getGasPrice).toBeDefined();
      expect(l1TxUtils.estimateGas).toBeDefined();
      expect(l1TxUtils.getTransactionStats).toBeDefined();
      expect(l1TxUtils.simulate).toBeDefined();
      expect(l1TxUtils.bumpGasLimit).toBeDefined();
    });

    it('L1TxUtils cannot be instantiated with public client', () => {
      expect(() => {
        createL1TxUtilsFromViemWallet(publicClient as any, { logger });
      }).toThrow();
    });
  });
});

class TestL1TxUtilsWithBlobs extends L1TxUtilsWithBlobs {
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
