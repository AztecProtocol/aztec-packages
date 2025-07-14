import { Blob } from '@aztec/blob-lib';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';
import type { Anvil } from '@viem/anvil';
import { type Abi, createPublicClient, http } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client, getPublicClient } from './client.js';
import { L1TxUtils, ReadOnlyL1TxUtils, defaultL1TxUtilsConfig } from './l1_tx_utils.js';
import { L1TxUtilsWithBlobs } from './l1_tx_utils_with_blobs.js';
import { EthCheatCodes } from './test/eth_cheat_codes.js';
import { startAnvil } from './test/start_anvil.js';
import type { ExtendedViemWalletClient, ViemClient } from './types.js';
import { formatViemError } from './utils.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
const logger = createLogger('ethereum:test:l1_tx_utils');
// Simple contract that just returns 42
const SIMPLE_CONTRACT_BYTECODE = '0x69602a60005260206000f3600052600a6016f3';

export type PendingTransaction = {
  hash: `0x${string}`;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

describe('L1TxUtils', () => {
  let gasUtils: L1TxUtilsWithBlobs;
  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let cheatCodes: EthCheatCodes;
  const initialBaseFee = WEI_CONST; // 1 gwei

  beforeAll(async () => {
    const { anvil: anvilInstance, rpcUrl } = await startAnvil({ l1BlockTime: 1 });
    anvil = anvilInstance;
    cheatCodes = new EthCheatCodes([rpcUrl]);
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);

    // set base fee
    await l1Client.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
    await cheatCodes.evmMine();

    gasUtils = new L1TxUtilsWithBlobs(l1Client, logger, {
      gasLimitBufferPercentage: 20,
      maxGwei: 500n,
      maxAttempts: 3,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });
  });

  afterEach(async () => {
    // Reset base fee
    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();
  });
  afterAll(async () => {
    // disabling interval mining as it seems to cause issues with stopping anvil
    await cheatCodes.setIntervalMining(0); // Disable interval mining
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 5_000);

  it('sends and monitors a simple transaction', async () => {
    const { receipt } = await gasUtils.sendAndMonitorTransaction({
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: 0n,
    });

    expect(receipt.status).toBe('success');
  }, 10_000);

  it('handles gas price spikes by retrying with higher gas price', async () => {
    // Disable all forms of mining
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

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
    const monitorFn = gasUtils.monitorTransaction(request, txHash, { gasLimit: estimatedGas }, undefined, {
      blobs: [blobData],
      kzg,
      maxFeePerBlobGas: WEI_CONST * 20n,
    });

    await sleep(2000);
    // re-enable mining
    await cheatCodes.setIntervalMining(1);
    const receipt = await monitorFn;
    expect(receipt.status).toBe('success');
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
    const baselineGasUtils = new L1TxUtilsWithBlobs(l1Client, logger, {
      gasLimitBufferPercentage: 0,
      maxGwei: 500n,
      maxAttempts: 5,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });

    const { receipt: baselineTx } = await baselineGasUtils.sendAndMonitorTransaction({
      to: EthAddress.ZERO.toString(),
      data: SIMPLE_CONTRACT_BYTECODE,
    });

    // Get the transaction details to see the gas limit
    const baselineDetails = await l1Client.getTransaction({
      hash: baselineTx.transactionHash,
    });

    // Now deploy with 20% buffer
    const bufferedGasUtils = new L1TxUtilsWithBlobs(l1Client, logger, {
      gasLimitBufferPercentage: 20,
      maxGwei: 500n,
      maxAttempts: 3,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });

    const { receipt: bufferedTx } = await bufferedGasUtils.sendAndMonitorTransaction({
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
    const gasUtils = new L1TxUtilsWithBlobs(l1Client, logger, {
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
      expect(message).toContain('fee cap');

      // Check request body formatting if present
      if (message.includes('Request body:')) {
        const bodyStart = message.indexOf('Request body:');
        const body = message.slice(bodyStart);
        expect(body).toContain('eth_sendRawTransaction');
        // Check params are truncated if too long
        if (body.includes('0x')) {
          expect(body).toContain('...');
        }
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

  it('handles custom errors', async () => {
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
    const abi = [
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'val',
            type: 'uint256',
          },
        ],
        name: 'Test_Error',
        type: 'error',
      },
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'num',
            type: 'uint256',
          },
        ],
        name: 'triggerError',
        outputs: [],
        stateMutability: 'pure',
        type: 'function',
      },
    ] as Abi;
    const deployHash = await l1Client.deployContract({
      abi,
      bytecode:
        // contract bytecode
        '0x6080604052348015600e575f5ffd5b506101508061001c5f395ff3fe608060405234801561000f575f5ffd5b5060043610610029575f3560e01c80638291d6871461002d575b5f5ffd5b610047600480360381019061004291906100c7565b610049565b005b5f819061008c576040517fcdae48f50000000000000000000000000000000000000000000000000000000081526004016100839190610101565b60405180910390fd5b5050565b5f5ffd5b5f819050919050565b6100a681610094565b81146100b0575f5ffd5b50565b5f813590506100c18161009d565b92915050565b5f602082840312156100dc576100db610090565b5b5f6100e9848285016100b3565b91505092915050565b6100fb81610094565b82525050565b5f6020820190506101145f8301846100f2565b9291505056fea264697066735822122011972815480b23be1e371aa7c11caa30281e61b164209ae84edcd3fee026278364736f6c634300081b0033',
    });

    const receipt = await l1Client.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) {
      throw new Error('No contract address');
    }
    const contractAddress = receipt.contractAddress;

    try {
      await l1Client.simulateContract({
        address: contractAddress!,
        abi,
        functionName: 'triggerError',
        args: [33],
      });
    } catch (err: any) {
      const { message } = formatViemError(err, abi);
      expect(message).toBe('Test_Error(33)');
    }
  });
  it('stops trying after timeout', async () => {
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    const now = Date.now();
    await expect(
      gasUtils.sendAndMonitorTransaction(
        {
          to: '0x1234567890123456789012345678901234567890',
          data: '0x',
          value: 0n,
        },
        { txTimeoutAt: new Date(now + 1000) },
      ),
    ).rejects.toThrow(/timed out/);
    expect(Date.now() - now).toBeGreaterThanOrEqual(990);
  }, 60_000);

  it('attempts to cancel timed out transactions', async () => {
    // Disable auto-mining to control block production
    await cheatCodes.setIntervalMining(0);
    await cheatCodes.setAutomine(false);

    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 1n,
    };

    // Send initial transaction
    const { txHash } = await gasUtils.sendTransaction(request);
    const initialTx = await l1Client.getTransaction({ hash: txHash });

    // Try to monitor with a short timeout
    const monitorPromise = gasUtils.monitorTransaction(
      request,
      txHash,
      { gasLimit: initialTx.gas! },
      { txTimeoutMs: 100, checkIntervalMs: 10 }, // Short timeout to trigger cancellation quickly
    );

    // Wait for timeout and catch the error
    await expect(monitorPromise).rejects.toThrow('timed out');

    // Wait for cancellation tx to be sent
    await sleep(100);

    // Get the nonce that was used
    const nonce = initialTx.nonce;

    // Get pending transactions
    const pendingBlock = await l1Client.getBlock({ blockTag: 'pending' });
    const pendingTxHash = pendingBlock.transactions[0];
    const cancelTx = await l1Client.getTransaction({ hash: pendingTxHash });

    // Verify cancellation tx
    expect(cancelTx).toBeDefined();
    expect(cancelTx!.nonce).toBe(nonce);
    expect(cancelTx!.to!.toLowerCase()).toBe(l1Client.account.address.toLowerCase());
    expect(cancelTx!.value).toBe(0n);
    expect(cancelTx!.maxFeePerGas).toBeGreaterThan(initialTx.maxFeePerGas!);
    expect(cancelTx!.maxPriorityFeePerGas).toBeGreaterThan(initialTx.maxPriorityFeePerGas!);
    expect(cancelTx!.gas).toBe(21000n);

    // Mine a block to process the cancellation
    await cheatCodes.evmMine();

    // Verify the original transaction is no longer present
    await expect(l1Client.getTransaction({ hash: txHash })).rejects.toThrow();
  }, 10_000);

  it('attempts to cancel timed out blob transactions with correct parameters', async () => {
    // Disable auto-mining to control block production
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Create blob data
    const blobData = new Uint8Array(131072).fill(1);
    const kzg = Blob.getViemKzgInstance();

    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
    };

    // Send initial blob transaction
    const { txHash } = await gasUtils.sendTransaction(request, undefined, {
      blobs: [blobData],
      kzg,
      maxFeePerBlobGas: 100n * WEI_CONST, // 100 gwei
    });
    const initialTx = await l1Client.getTransaction({ hash: txHash });

    // Try to monitor with a short timeout
    const monitorPromise = gasUtils.monitorTransaction(
      request,
      txHash,
      { gasLimit: initialTx.gas! },
      { txTimeoutMs: 100, checkIntervalMs: 10 }, // Short timeout to trigger cancellation quickly
      {
        blobs: [blobData],
        kzg,
        maxFeePerBlobGas: 100n * WEI_CONST,
      },
    );

    // Wait for timeout and catch the error
    await expect(monitorPromise).rejects.toThrow('timed out');

    // Wait for cancellation tx to be sent
    await sleep(100);

    // Get the nonce that was used
    const nonce = initialTx.nonce;

    // Get pending transactions
    const pendingBlock = await l1Client.getBlock({ blockTag: 'pending' });
    const pendingTxHash = pendingBlock.transactions[0];
    const cancelTx = await l1Client.getTransaction({ hash: pendingTxHash });

    // Verify cancellation tx
    expect(cancelTx).toBeDefined();
    expect(cancelTx!.nonce).toBe(nonce);
    expect(cancelTx!.to!.toLowerCase()).toBe(l1Client.account.address.toLowerCase());
    expect(cancelTx!.value).toBe(0n);
    expect(cancelTx!.maxFeePerGas).toBeGreaterThan(initialTx.maxFeePerGas!);
    expect(cancelTx!.maxPriorityFeePerGas).toBeGreaterThan(initialTx.maxPriorityFeePerGas!);
    expect(cancelTx!.maxFeePerBlobGas).toBeGreaterThan(initialTx.maxFeePerBlobGas!);
    expect(cancelTx!.blobVersionedHashes).toBeDefined();
    expect(cancelTx!.blobVersionedHashes!.length).toBe(1);

    // Mine a block to process the cancellation
    await cheatCodes.evmMine();

    // Verify the original transaction is no longer present
    await expect(l1Client.getTransaction({ hash: txHash })).rejects.toThrow();
  }, 10_000);

  it('does not attempt to cancel a timed out tx when cancelTxOnTimeout is false', async () => {
    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
    };

    const { txHash } = await gasUtils.sendTransaction(request);
    const initialTx = await l1Client.getTransaction({ hash: txHash });

    // monitor with a short timeout and cancellation disabled
    const monitorPromise = gasUtils.monitorTransaction(
      request,
      txHash,
      { gasLimit: initialTx.gas! },
      { txTimeoutMs: 100, checkIntervalMs: 10, cancelTxOnTimeout: false }, // Disable cancellation
    );

    // Wait for timeout and catch the error
    await expect(monitorPromise).rejects.toThrow('timed out');

    // Wait to ensure no cancellation tx is sent
    await sleep(100);

    // Get the nonce that was used
    const nonce = initialTx.nonce;

    // Get pending transactions
    const pendingBlock = await l1Client.getBlock({ blockTag: 'pending' });

    // Check no additional transactions were sent (only the initial tx should be present)
    expect(pendingBlock.transactions.length).toBe(1);
    expect(pendingBlock.transactions[0]).toBe(txHash);

    // Original tx should still be available
    const tx = await l1Client.getTransaction({ hash: txHash });
    expect(tx).toBeDefined();
    expect(tx!.nonce).toBe(nonce);
  }, 10_000);

  it('ensures block gas limit is set when using LARGE_GAS_LIMIT', async () => {
    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
    };

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
    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
    };

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
});

describe('L1TxUtils vs ReadOnlyL1TxUtils', () => {
  let publicClient: ViemClient;
  let walletClient: ExtendedViemWalletClient;

  beforeAll(async () => {
    const { rpcUrl } = await startAnvil({ l1BlockTime: 1 });

    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    walletClient = createExtendedL1Client([rpcUrl], account, foundry);
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });
  });

  it('ReadOnlyL1TxUtils can be instantiated with public client but not wallet methods', () => {
    const readOnlyUtils = new ReadOnlyL1TxUtils(publicClient, logger);
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
    const l1TxUtils = new L1TxUtils(walletClient, logger);
    expect(l1TxUtils).toBeDefined();
    expect(l1TxUtils.client).toBe(walletClient);

    // Verify wallet-specific methods are available
    expect(l1TxUtils.getSenderAddress).toBeDefined();
    expect(l1TxUtils.getSenderBalance).toBeDefined();
    expect(l1TxUtils.sendTransaction).toBeDefined();
    expect(l1TxUtils.monitorTransaction).toBeDefined();
    expect(l1TxUtils.sendAndMonitorTransaction).toBeDefined();
  });

  it('L1TxUtils inherits all read-only methods from ReadOnlyL1TxUtils', () => {
    const l1TxUtils = new L1TxUtils(walletClient, logger);

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
      new L1TxUtils(publicClient as any, logger);
    }).toThrow();
  });
});

describe('With replacePreviousPendingTx', () => {
  let gasUtils: L1TxUtils;
  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let cheatCodes: EthCheatCodes;
  const initialBaseFee = WEI_CONST; // 1 gwei

  beforeAll(async () => {
    const { anvil: anvilInstance, rpcUrl } = await startAnvil({ l1BlockTime: 1, log: true });
    anvil = anvilInstance;
    cheatCodes = new EthCheatCodes([rpcUrl]);
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);

    // set base fee
    await l1Client.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
    await cheatCodes.evmMine();
  });

  afterEach(async () => {
    // Reset base fee
    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();
    // Re-enable mining
    await cheatCodes.setAutomine(true);
    await cheatCodes.setIntervalMining(0);
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 5_000);

  it('replaces pending transaction when replacePreviousPendingTx is true', async () => {
    // Create gas utils with replacePreviousPendingTx enabled
    gasUtils = new L1TxUtils(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      replacePreviousPendingTx: true,
      checkIntervalMs: 100,
      stallTimeMs: 10000,
    });

    // Disable mining to keep transactions pending
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Send first transaction
    const request1 = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { txHash: txHash1 } = await gasUtils.sendTransaction(request1);
    const tx1 = await l1Client.getTransaction({ hash: txHash1 });

    // Send second transaction (should replace the first one)
    const request2 = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
      data: '0x5678' as `0x${string}`,
      value: 2n,
    };

    const { txHash: txHash2 } = await gasUtils.sendTransaction(request2);
    const tx2 = await l1Client.getTransaction({ hash: txHash2 });

    // Verify both transactions have the same nonce
    expect(tx2.nonce).toBe(tx1.nonce);

    // Verify the second transaction has higher gas prices
    expect(tx2.maxFeePerGas!).toBeGreaterThan(tx1.maxFeePerGas!);
    expect(tx2.maxPriorityFeePerGas!).toBeGreaterThan(tx1.maxPriorityFeePerGas!);

    // Verify the transaction details match the second request
    expect(tx2.to!.toLowerCase()).toBe(request2.to.toLowerCase());
    expect(tx2.input).toBe(request2.data);
    expect(tx2.value).toBe(request2.value);

    // Mine a block to process the transaction
    await cheatCodes.evmMine();

    // Only the second transaction should be mined
    const receipt2 = await l1Client.getTransactionReceipt({ hash: txHash2 });
    expect(receipt2.status).toBe('success');

    // The first transaction should not exist anymore
    await expect(l1Client.getTransaction({ hash: txHash1 })).rejects.toThrow();
  }, 20_000);

  it('does not replace pending transaction when replacePreviousPendingTx is false', async () => {
    // Create gas utils with replacePreviousPendingTx disabled (default)
    gasUtils = new L1TxUtils(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      replacePreviousPendingTx: false,
    });

    // Disable mining to keep transactions pending
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Send first transaction
    const request1 = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { txHash: txHash1 } = await gasUtils.sendTransaction(request1);
    const tx1 = await l1Client.getTransaction({ hash: txHash1 });

    // Send second transaction (should NOT replace the first one)
    const request2 = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
      data: '0x5678' as `0x${string}`,
      value: 2n,
    };

    const { txHash: txHash2 } = await gasUtils.sendTransaction(request2);
    const tx2 = await l1Client.getTransaction({ hash: txHash2 });

    // Verify transactions have different nonces
    expect(tx2.nonce).toBe(tx1.nonce + 1);

    // Mine blocks to process both transactions
    await cheatCodes.evmMine();
    await cheatCodes.evmMine();

    // Both transactions should be mined
    const receipt1 = await l1Client.getTransactionReceipt({ hash: txHash1 });
    const receipt2 = await l1Client.getTransactionReceipt({ hash: txHash2 });
    expect(receipt1.status).toBe('success');
    expect(receipt2.status).toBe('success');
  }, 20_000);

  it('clears stale pending request when nonce has advanced', async () => {
    // Create gas utils with replacePreviousPendingTx enabled
    gasUtils = new L1TxUtils(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      replacePreviousPendingTx: true,
    });

    // Disable mining to keep first transaction pending
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Send first transaction
    const request1 = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { txHash: txHash1 } = await gasUtils.sendTransaction(request1);
    const tx1 = await l1Client.getTransaction({ hash: txHash1 });

    // Mine the transaction
    await cheatCodes.evmMine();

    // Wait for receipt
    const receipt1 = await l1Client.getTransactionReceipt({ hash: txHash1 });
    expect(receipt1.status).toBe('success');

    // Send second transaction (should get a new nonce since first is mined)
    const request2 = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
      data: '0x5678' as `0x${string}`,
      value: 2n,
    };

    const { txHash: txHash2 } = await gasUtils.sendTransaction(request2);
    const tx2 = await l1Client.getTransaction({ hash: txHash2 });

    // Verify the second transaction has a new nonce
    expect(tx2.nonce).toBe(tx1.nonce + 1);
  }, 20_000);

  it('throws ReplacedL1TxError when transaction is replaced externally', async () => {
    // Create gas utils
    gasUtils = new L1TxUtils(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      checkIntervalMs: 100,
      stallTimeMs: 10000,
    });

    // Disable mining to keep transactions pending
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Send first transaction
    const request1 = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { txHash: txHash1 } = await gasUtils.sendTransaction(request1);
    const tx1 = await l1Client.getTransaction({ hash: txHash1 });

    const monitorPromise = gasUtils.monitorTransaction(request1, txHash1, { gasLimit: tx1.gas! });

    // Manually send a replacement transaction with the same nonce but different request
    await l1Client.sendTransaction({
      to: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`,
      data: '0xdead' as `0x${string}`,
      value: 10n,
      nonce: tx1.nonce,
      maxFeePerGas: tx1.maxFeePerGas! * 2n,
      maxPriorityFeePerGas: tx1.maxPriorityFeePerGas! * 2n,
      gas: 100_000n,
    });

    // Mine the replacement transaction
    await cheatCodes.evmMine();

    // Monitor should throw ReplacedL1TxError
    await expect(monitorPromise).rejects.toThrow('was replaced by a different tx');
  }, 20_000);

  it('correctly handles multiple replacements with blob transactions', async () => {
    // Create gas utils with replacePreviousPendingTx enabled
    const blobGasUtils = new L1TxUtilsWithBlobs(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      replacePreviousPendingTx: true,
      checkIntervalMs: 100,
      stallTimeMs: 10000,
    });

    // Disable mining to keep transactions pending
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);

    // Create blob data
    const blobData = new Uint8Array(131072).fill(1);
    const kzg = Blob.getViemKzgInstance();

    // Send first blob transaction
    const request1 = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { txHash: txHash1 } = await blobGasUtils.sendTransaction(request1, undefined, {
      blobs: [blobData],
      kzg,
      maxFeePerBlobGas: 100n * WEI_CONST,
    });
    const tx1 = await l1Client.getTransaction({ hash: txHash1 });

    // Send second blob transaction (should replace the first one)
    const request2 = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
      data: '0x5678' as `0x${string}`,
      value: 2n,
    };

    const { txHash: txHash2 } = await blobGasUtils.sendTransaction(request2, undefined, {
      blobs: [blobData],
      kzg,
      maxFeePerBlobGas: 100n * WEI_CONST,
    });
    const tx2 = await l1Client.getTransaction({ hash: txHash2 });

    // Verify both transactions have the same nonce
    expect(tx2.nonce).toBe(tx1.nonce);

    // Verify the second transaction has higher gas prices (including blob gas)
    expect(tx2.maxFeePerGas!).toBeGreaterThan(tx1.maxFeePerGas!);
    expect(tx2.maxPriorityFeePerGas!).toBeGreaterThan(tx1.maxPriorityFeePerGas!);
    expect(tx2.maxFeePerBlobGas!).toBeGreaterThan(tx1.maxFeePerBlobGas!);

    // Mine a block to process the transaction
    await cheatCodes.evmMine();

    // Only the second transaction should be mined
    const receipt2 = await l1Client.getTransactionReceipt({ hash: txHash2 });
    expect(receipt2.status).toBe('success');
    expect(receipt2.blobGasUsed).toBeDefined();

    // The first transaction should not exist anymore
    await expect(l1Client.getTransaction({ hash: txHash1 })).rejects.toThrow();
  }, 20_000);

  it('clears pending request after successful monitoring', async () => {
    // Create gas utils with replacePreviousPendingTx enabled
    gasUtils = new L1TxUtils(l1Client, logger, {
      ...defaultL1TxUtilsConfig,
      replacePreviousPendingTx: true,
    });

    await cheatCodes.evmMine();
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(1);

    // Send and monitor a transaction
    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: 1n,
    };

    const { receipt } = await gasUtils.sendAndMonitorTransaction(request);
    expect(receipt.status).toBe('success');

    // Send another transaction - should get a new nonce
    const request2 = {
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
      data: '0x5678' as `0x${string}`,
      value: 2n,
    };

    const { txHash: txHash2 } = await gasUtils.sendTransaction(request2);
    const tx2 = await l1Client.getTransaction({ hash: txHash2 });

    // Verify it got a new nonce (not replacing anything)
    expect(tx2.nonce).toBeGreaterThan(0);
  }, 20_000);
});
