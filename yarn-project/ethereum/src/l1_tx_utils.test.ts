import { EthAddress } from '@aztec/foundation/eth-address';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { type Anvil, createAnvil } from '@viem/anvil';
import getPort from 'get-port';
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

import { L1TxUtils } from './l1_tx_utils.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
// Simple contract that just returns 42
const SIMPLE_CONTRACT_BYTECODE = '0x69602a60005260206000f3600052600a6016f3';

const startAnvil = async (l1BlockTime?: number) => {
  const ethereumHostPort = await getPort();
  const rpcUrl = `http://127.0.0.1:${ethereumHostPort}`;
  const anvil = createAnvil({
    port: ethereumHostPort,
    blockTime: l1BlockTime,
  });
  await anvil.start();
  return { anvil, rpcUrl };
};

describe('GasUtils', () => {
  let gasUtils: L1TxUtils;
  let walletClient: WalletClient<HttpTransport, Chain, Account>;
  let publicClient: PublicClient<HttpTransport, Chain>;
  let anvil: Anvil;
  const initialBaseFee = WEI_CONST; // 1 gwei
  const logger = createDebugLogger('l1_gas_test');

  beforeAll(async () => {
    const { anvil: anvilInstance, rpcUrl } = await startAnvil(1);
    anvil = anvilInstance;
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

    gasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      bufferPercentage: 20n,
      maxGwei: 500n,
      minGwei: 1n,
      maxAttempts: 3,
      checkIntervalMs: 100,
      stallTimeMs: 1000,
    });
  });
  afterEach(async () => {
    // Reset base fee
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
    await publicClient.transport.request({
      method: 'evm_mine',
      params: [],
    });
  });
  afterAll(async () => {
    // disabling interval mining as it seems to cause issues with stopping anvil
    await publicClient.transport.request({
      method: 'evm_setIntervalMining',
      params: [0], // Disable interval mining
    });
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
    await publicClient.transport.request({
      method: 'evm_setAutomine',
      params: [false],
    });
    await publicClient.transport.request({
      method: 'evm_setIntervalMining',
      params: [0],
    });

    // Ensure initial base fee is low
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });

    const request = {
      to: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
    };

    const estimatedGas = await publicClient.estimateGas(request);

    const txHash = await walletClient.sendTransaction({
      ...request,
      gas: estimatedGas,
      maxFeePerGas: WEI_CONST * 10n,
      maxPriorityFeePerGas: WEI_CONST,
    });

    const rawTx = await publicClient.transport.request({
      method: 'debug_getRawTransaction',
      params: [txHash],
    });

    // Temporarily drop the transaction
    await publicClient.transport.request({
      method: 'anvil_dropTransaction',
      params: [txHash],
    });

    // Mine a block with higher base fee
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [((WEI_CONST * 15n) / 10n).toString()],
    });
    await publicClient.transport.request({
      method: 'evm_mine',
      params: [],
    });

    // Re-add the original tx
    await publicClient.transport.request({
      method: 'eth_sendRawTransaction',
      params: [rawTx],
    });

    // keeping auto-mining disabled to simulate a stuck transaction
    // The monitor should detect the stall and create a replacement tx

    // Monitor should detect stall and replace with higher gas price
    const monitorFn = gasUtils.monitorTransaction(request, txHash, { gasLimit: estimatedGas });

    await sleep(2000);
    // re-enable mining
    await publicClient.transport.request({
      method: 'evm_setIntervalMining',
      params: [1],
    });
    const receipt = await monitorFn;
    expect(receipt.status).toBe('success');
    // Verify that a replacement transaction was created
    expect(receipt.transactionHash).not.toBe(txHash);
  }, 20_000);

  it('respects max gas price limits during spikes', async () => {
    const maxGwei = 500n;
    const newBaseFee = (maxGwei - 10n) * WEI_CONST;

    // Set base fee high but still under our max
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [newBaseFee.toString()],
    });

    // Mine a new block to make the base fee change take effect
    await publicClient.transport.request({
      method: 'evm_mine',
      params: [],
    });

    const receipt = await gasUtils.sendAndMonitorTransaction({
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: 0n,
    });

    expect(receipt.effectiveGasPrice).toBeLessThanOrEqual(maxGwei * WEI_CONST);
  }, 60_000);

  it('adds appropriate buffer to gas estimation', async () => {
    // First deploy without any buffer
    const baselineGasUtils = new L1TxUtils(publicClient, walletClient, logger, {
      bufferPercentage: 0n,
      maxGwei: 500n,
      minGwei: 1n,
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
      bufferPercentage: 20n,
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
});
