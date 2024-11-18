import { EthAddress } from '@aztec/foundation/eth-address';
import { createDebugLogger } from '@aztec/foundation/log';

import { type Anvil, createAnvil } from '@viem/anvil';
import getPort from 'get-port';
import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { GasUtils } from './gas_utils.js';

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
  let gasUtils: GasUtils;
  let publicClient: any;
  let walletClient: any;
  let account: any;
  let anvil: Anvil;
  let initialBaseFee: bigint;
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
    account = privateKeyToAccount(`0x${privKey}`);

    publicClient = createPublicClient({
      transport: http(rpcUrl),
      chain: foundry,
    });

    walletClient = createWalletClient({
      transport: http(rpcUrl),
      chain: foundry,
      account,
    });

    gasUtils = new GasUtils(
      publicClient,
      logger,
      {
        bufferPercentage: 20n,
        maxGwei: 500n,
        minGwei: 1n,
        priorityFeeGwei: 2n,
      },
      {
        maxAttempts: 3,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      },
    );
  });
  afterAll(async () => {
    await anvil.stop();
  }, 5000);

  it('sends and monitors a simple transaction', async () => {
    const receipt = await gasUtils.sendAndMonitorTransaction(walletClient, account, {
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: 0n,
    });

    expect(receipt.status).toBe('success');
  }, 10_000);

  it('handles gas price spikes by retrying with higher gas price', async () => {
    // Get initial base fee
    const initialBlock = await publicClient.getBlock({ blockTag: 'latest' });
    initialBaseFee = initialBlock.baseFeePerGas ?? 0n;

    // Start a transaction
    const sendPromise = gasUtils.sendAndMonitorTransaction(walletClient, account, {
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: 0n,
    });

    // Spike gas price to 3x the initial base fee
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [(initialBaseFee * 3n).toString()],
    });

    // Transaction should still complete
    const receipt = await sendPromise;
    expect(receipt.status).toBe('success');

    // Reset base fee
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
  });

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

    const receipt = await gasUtils.sendAndMonitorTransaction(walletClient, account, {
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      value: 0n,
    });

    expect(receipt.effectiveGasPrice).toBeLessThanOrEqual(maxGwei * WEI_CONST);

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

  it('adds appropriate buffer to gas estimation', async () => {
    // First deploy without any buffer
    const baselineGasUtils = new GasUtils(
      publicClient,
      logger,
      {
        bufferPercentage: 0n,
        maxGwei: 500n,
        minGwei: 1n,
        priorityFeeGwei: 2n,
      },
      {
        maxAttempts: 3,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      },
    );

    const baselineTx = await baselineGasUtils.sendAndMonitorTransaction(walletClient, account, {
      to: EthAddress.ZERO.toString(),
      data: SIMPLE_CONTRACT_BYTECODE,
    });

    // Get the transaction details to see the gas limit
    const baselineDetails = await publicClient.getTransaction({
      hash: baselineTx.transactionHash,
    });

    // Now deploy with 20% buffer
    const bufferedGasUtils = new GasUtils(
      publicClient,
      logger,
      {
        bufferPercentage: 20n,
        maxGwei: 500n,
        minGwei: 1n,
        priorityFeeGwei: 2n,
      },
      {
        maxAttempts: 3,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      },
    );

    const bufferedTx = await bufferedGasUtils.sendAndMonitorTransaction(walletClient, account, {
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
