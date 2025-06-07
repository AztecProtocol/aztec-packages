import { Blob } from '@aztec/blob-lib';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import type { Anvil } from '@viem/anvil';
import { type Abi, createPublicClient, http } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client, getPublicClient } from './client.js';
import { EthCheatCodes } from './eth_cheat_codes.js';
import { L1TxUtils, ReadOnlyL1TxUtils, defaultL1TxUtilsConfig } from './l1_tx_utils.js';
import { L1TxUtilsWithBlobs } from './l1_tx_utils_with_blobs.js';
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

describe('GasUtils', () => {
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
      value: 0n,
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

    // // Verify cancellation tx
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
