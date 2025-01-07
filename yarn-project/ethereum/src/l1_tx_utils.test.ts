import { Blob } from '@aztec/foundation/blob';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { type Anvil } from '@viem/anvil';
import {
  type Account,
  type Chain,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { EthCheatCodes } from './eth_cheat_codes.js';
import { L1TxUtils, defaultL1TxUtilsConfig } from './l1_tx_utils.js';
import { startAnvil } from './test/start_anvil.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
// Simple contract that just returns 42
const SIMPLE_CONTRACT_BYTECODE = '0x69602a60005260206000f3600052600a6016f3';

export type PendingTransaction = {
  hash: `0x${string}`;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

describe('GasUtils', () => {
  let gasUtils: L1TxUtils;
  let walletClient: WalletClient<HttpTransport, Chain, Account>;
  let publicClient: PublicClient<HttpTransport, Chain>;
  let anvil: Anvil;
  let cheatCodes: EthCheatCodes;
  const initialBaseFee = WEI_CONST; // 1 gwei
  const logger = createLogger('ethereum:test:l1_gas_test');

  beforeAll(async () => {
    const { anvil: anvilInstance, rpcUrl } = await startAnvil(1);
    anvil = anvilInstance;
    cheatCodes = new EthCheatCodes(rpcUrl);
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = Buffer.from(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    publicClient = createPublicClient({
      transport: http(rpcUrl),
      chain: foundry,
    });

    walletClient = createWalletClient({
      transport: http(rpcUrl),
      chain: foundry,
      account,
    });

    // set base fee
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
    await cheatCodes.evmMine();

    gasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      gasLimitBufferPercentage: 20n,
      maxGwei: 500n,
      minGwei: 1n,
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
    await anvil.stop();
  }, 5_000);

  it('sends and monitors a simple transaction', async () => {
    const receipt = await gasUtils.sendAndMonitorTransaction({
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

    const estimatedGas = await publicClient.estimateGas(request);

    const originalMaxFeePerGas = WEI_CONST * 10n;
    const originalMaxPriorityFeePerGas = WEI_CONST;
    const originalMaxFeePerBlobGas = WEI_CONST * 10n;

    const txHash = await walletClient.sendTransaction({
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
    await publicClient.transport.request({
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
    const replacementTx = await publicClient.getTransaction({ hash: receipt.transactionHash });

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

    const receipt = await gasUtils.sendAndMonitorTransaction(
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
    const baselineGasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      gasLimitBufferPercentage: 0n,
      maxGwei: 500n,
      minGwei: 10n, // Increased minimum gas price
      maxAttempts: 5,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });

    const baselineTx = await baselineGasUtils.sendAndMonitorTransaction({
      to: EthAddress.ZERO.toString(),
      data: SIMPLE_CONTRACT_BYTECODE,
    });

    // Get the transaction details to see the gas limit
    const baselineDetails = await publicClient.getTransaction({
      hash: baselineTx.transactionHash,
    });

    // Now deploy with 20% buffer
    const bufferedGasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      gasLimitBufferPercentage: 20n,
      maxGwei: 500n,
      minGwei: 1n,
      maxAttempts: 3,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });

    const bufferedTx = await bufferedGasUtils.sendAndMonitorTransaction({
      to: EthAddress.ZERO.toString(),
      data: SIMPLE_CONTRACT_BYTECODE,
    });

    const bufferedDetails = await publicClient.getTransaction({
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

    const basePriorityFee = await publicClient.estimateMaxPriorityFeePerGas();
    const gasPrice = await gasUtils['getGasPrice']();

    // With default config, priority fee should be bumped by 20%
    const expectedPriorityFee = (basePriorityFee * 120n) / 100n;

    // Base fee should be bumped for potential stalls (1.125^(stallTimeMs/12000) = ~1.125 for default config)
    const expectedMaxFee = (WEI_CONST * 1125n) / 1000n + expectedPriorityFee;

    expect(gasPrice.maxPriorityFeePerGas).toBe(expectedPriorityFee);
    expect(gasPrice.maxFeePerGas).toBe(expectedMaxFee);
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
    const gasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      ...defaultL1TxUtilsConfig,
      priorityFeeRetryBumpPercentage: 5n, // Set lower than minimum 10%
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

    const baseEstimate = await publicClient.estimateGas(request);
    const bufferedEstimate = await gasUtils.estimateGas(walletClient.account!, request);

    // adds 20% buffer
    const expectedEstimate = baseEstimate + (baseEstimate * 20n) / 100n;
    expect(bufferedEstimate).toBe(expectedEstimate);
  });

  it('correctly handles transactions with blobs', async () => {
    // Create a sample blob
    const blobData = new Uint8Array(131072).fill(1); // 128KB blob
    const kzg = Blob.getViemKzgInstance();

    const receipt = await gasUtils.sendAndMonitorTransaction(
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
    const baseEstimate = await gasUtils.estimateGas(walletClient.account!, request);

    // Estimate gas with blobs
    const blobEstimate = await gasUtils.estimateGas(walletClient.account!, request, undefined, {
      blobs: [blobData],
      kzg,
      maxFeePerBlobGas: 10000000000n,
    });
    // Blob transactions should require more gas
    expect(blobEstimate).toBeGreaterThan(baseEstimate);
  }, 20_000);
});
