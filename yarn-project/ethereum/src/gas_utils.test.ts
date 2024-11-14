import { createDebugLogger } from '@aztec/foundation/log';

import { createAnvil } from '@viem/anvil';
import getPort from 'get-port';
import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { GasUtils } from './gas_utils.js';

const MNEMONIC = 'test test test test test test test test test test test junk';

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

describe('e2e_l1_gas', () => {
  let gasUtils: GasUtils;
  let publicClient: any;
  let walletClient: any;
  const logger = createDebugLogger('l1_gas_test');

  beforeAll(async () => {
    const { rpcUrl } = await startAnvil(12);
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      // should never happen, used for types
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
        checkIntervalMs: 1000,
        stallTimeMs: 3000,
        gasPriceIncrease: 50n,
      },
    );
  });

  it('handles gas price spikes by increasing gas price', async () => {
    // Get initial base fee and verify we're starting from a known state
    const initialBlock = await publicClient.getBlock({ blockTag: 'latest' });
    const initialBaseFee = initialBlock.baseFeePerGas ?? 0n;

    // Send initial transaction with current gas price
    const initialGasPrice = await gasUtils.getGasPrice();
    expect(initialGasPrice).toBeGreaterThanOrEqual(initialBaseFee); // Sanity check

    const initialTxHash = await walletClient.sendTransaction({
      to: '0x1234567890123456789012345678901234567890',
      value: 0n,
      maxFeePerGas: initialGasPrice,
      gas: 21000n,
    });

    // Spike gas price to 3x the initial base fee
    const spikeBaseFee = initialBaseFee * 3n;
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [spikeBaseFee.toString()],
    });

    // Monitor the transaction - it should automatically increase gas price
    const receipt = await gasUtils.monitorTransaction(initialTxHash, walletClient, {
      to: '0x1234567890123456789012345678901234567890',
      data: '0x',
      nonce: await publicClient.getTransactionCount({ address: walletClient.account.address }),
      gasLimit: 21000n,
      maxFeePerGas: initialGasPrice,
    });

    // Transaction should eventually succeed
    expect(receipt.status).toBe('success');

    // Gas price should have been increased from initial price
    const finalGasPrice = receipt.effectiveGasPrice;
    expect(finalGasPrice).toBeGreaterThan(initialGasPrice);

    // Reset base fee to initial value for cleanup
    await publicClient.transport.request({
      method: 'anvil_setNextBlockBaseFeePerGas',
      params: [initialBaseFee.toString()],
    });
  });

  it('respects max gas price limits during spikes', async () => {
    const maxGwei = 500n;
    const gasPrice = await gasUtils.getGasPrice();

    // Even with huge base fee, should not exceed max
    expect(gasPrice).toBeLessThanOrEqual(maxGwei * 1000000000n);
  });
});
