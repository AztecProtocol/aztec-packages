import { sleep } from '@aztec/foundation/sleep';

import type { Anvil } from '@viem/anvil';
import {
  type PrivateKeyAccount,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  http,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { fallback } from '../fallback_transport.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { startAnvil } from './start_anvil.js';

describe('fallback_transport', () => {
  let rpcUrl1: string;
  let rpcUrl2: string;
  let account: PrivateKeyAccount;
  let client: ExtendedViemWalletClient;
  let publicClient1: PublicClient;
  let publicClient2: PublicClient;
  let anvil1: Anvil;
  let anvil2: Anvil;

  afterAll(async () => {
    await anvil1.stop();
    await anvil2.stop();
  }, 5_000);

  beforeEach(async () => {
    // Start two separate Anvil instances
    const anvil1Result = await startAnvil();
    const anvil2Result = await startAnvil();

    anvil1 = anvil1Result.anvil;
    anvil2 = anvil2Result.anvil;

    rpcUrl1 = anvil1Result.rpcUrl;

    rpcUrl2 = anvil2Result.rpcUrl;

    // Create public clients to directly check each node
    publicClient1 = createPublicClient({
      transport: http(rpcUrl1),
      chain: foundry,
    });

    publicClient2 = createPublicClient({
      transport: http(rpcUrl2),
      chain: foundry,
    });
    account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

    // Create a client with fallback transport using both nodes
    const transport = fallback([http(rpcUrl1), http(rpcUrl2)]);

    // Create a wallet client with the fallback transport
    client = createWalletClient({
      transport,
      chain: foundry,
      account,
    }).extend(publicActions);
  });

  it('sends a transaction using the first node', async () => {
    // Send a transaction
    const hash = await client.sendTransaction({ to: account.address, value: 1n });

    // Wait for the transaction receipt
    const receipt = await client.waitForTransactionReceipt({ hash });

    // Verify the transaction was successful
    expect(receipt).toBeDefined();
    expect(receipt.status).toBe('success');

    // Check if the transaction exists on the first node
    const tx1 = await publicClient1.getTransaction({ hash });
    expect(tx1).not.toBeNull();

    // Verify the transaction is in a block on the first node
    if (tx1?.blockHash) {
      const blockByHash1 = await publicClient1.getBlock({ blockHash: tx1.blockHash });
      expect(blockByHash1.number).toBeGreaterThanOrEqual(1n);
    } else {
      fail('Transaction should have a block hash');
    }
  });

  it('falls back to the second node when the first node is down', async () => {
    // Stop the first Anvil instance to simulate a node failure
    await anvil1.stop();

    // Send a transaction
    const hash = await client.sendTransaction({ to: account.address, value: 1n });

    // Wait for the transaction receipt
    const receipt = await client.waitForTransactionReceipt({ hash });

    // Verify the transaction was successful
    expect(receipt).toBeDefined();
    expect(receipt.status).toBe('success');

    // Check if the transaction exists on the second node
    const tx2 = await publicClient2.getTransaction({ hash }).catch(() => null);
    expect(tx2).not.toBeNull();

    // Verify the transaction is in a block on the second node
    if (tx2?.blockHash) {
      const blockByHash2 = await publicClient2.getBlock({ blockHash: tx2.blockHash });
      expect(blockByHash2.number).toBeGreaterThanOrEqual(1n);
    } else {
      fail('Transaction should have a block hash');
    }
  });

  it('does not fall back when encountering a contract error', async () => {
    // Deploy a simple contract that will revert
    // This is a minimal contract that always reverts with "ALWAYS_REVERT"
    const bytecode = '0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfe';

    // Deploy the contract
    const deployHash = await client.sendTransaction({
      data: bytecode,
    });
    const deployReceipt = await client.waitForTransactionReceipt({ hash: deployHash });
    expect(deployReceipt.status).toBe('success');
    const contractAddress = deployReceipt.contractAddress;
    expect(contractAddress).toBeDefined();

    // this should revert
    try {
      await client.sendTransaction({
        to: contractAddress,
        data: '0xcafe',
      });

      fail('Transaction should have reverted');
    } catch (error: any) {
      // The error should be from the first node
      expect(error.message).toContain('revert');

      // Wait a sec to ensure any potential transaction would have been processed
      await sleep(1000);

      // Check that no transactions were sent to the contract on the second node
      const block1 = await publicClient1.getBlock();
      const block2 = await publicClient2.getBlock();

      expect(block1.transactions.length).toBe(1);
      expect(block2.transactions.length).toBe(0);
    }
  });
});
