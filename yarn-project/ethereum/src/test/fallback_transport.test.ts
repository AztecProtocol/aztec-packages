import { jest } from '@jest/globals';
import type { Anvil } from '@viem/anvil';
import {
  type Account,
  type Chain,
  type Client,
  type CustomTransport,
  type EIP1193RequestFn,
  type FallbackTransport,
  type PrivateKeyAccount,
  type PublicActions,
  type PublicClient,
  type PublicRpcSchema,
  type WalletActions,
  type WalletRpcSchema,
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
  publicActions,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { startAnvil } from './start_anvil.js';

// using new type for custom transports
export type ExtendedWalletClient = Client<
  FallbackTransport<readonly CustomTransport[]>,
  Chain,
  Account,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<FallbackTransport<readonly CustomTransport[]>, Chain> & WalletActions<Chain, Account>
>;

describe('fallback_transport', () => {
  let rpcUrl1: string;
  let rpcUrl2: string;
  let account: PrivateKeyAccount;
  let publicClient1: PublicClient;
  let publicClient2: PublicClient;
  let anvil1: Anvil;
  let anvil2: Anvil;

  afterEach(async () => {
    await anvil1.stop();
    await anvil2.stop();
  }, 5_000);

  beforeEach(async () => {
    // Start two separate Anvil instances
    const anvil1Result = await startAnvil({ port: 8545 });
    const anvil2Result = await startAnvil({ port: 8546 });

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
  });

  it('sends a transaction using the first node', async () => {
    // Create a client with the first node
    const client = createWalletClient({
      transport: http(rpcUrl1),
      chain: foundry,
      account,
    }).extend(publicActions);

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
    // Create mock functions to track calls
    const node1Mock = jest.fn() as jest.Mock;
    const node2Mock = jest.fn() as jest.Mock;

    // Create custom transports with mocks
    const transport1 = custom({
      request: (({ method, params }) => {
        // Log the call
        node1Mock(method, params);
        // This will throw since the node is down
        throw new Error('Node is down');
      }) as EIP1193RequestFn,
    });

    const transport2 = custom({
      request: (async ({ method, params }) => {
        // Log the call
        node2Mock(method, params);
        // Forward to the real node
        const transport = http(rpcUrl2)({});
        return await transport.request({ method, params });
      }) as EIP1193RequestFn,
    });

    // Create a client with fallback transport
    const client = createWalletClient({
      transport: fallback([transport1, transport2]),
      chain: foundry,
      account,
    }).extend(publicActions);

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
    const tx2 = await publicClient2.getTransaction({ hash });
    expect(tx2).not.toBeNull();

    // Verify the transaction is in a block on the second node
    if (tx2?.blockHash) {
      const blockByHash2 = await publicClient2.getBlock({ blockHash: tx2.blockHash });
      expect(blockByHash2.number).toBeGreaterThanOrEqual(1n);
    } else {
      fail('Transaction should have a block hash');
    }

    // Verify node1 was called and failed
    expect(node1Mock).toHaveBeenCalled();

    // Verify node2 was called as a fallback
    expect(node2Mock).toHaveBeenCalledWith('eth_sendRawTransaction', expect.anything());
  });

  it('does not fall back when encountering a contract error', async () => {
    // Create mock functions to track calls
    const node1Mock = jest.fn() as jest.Mock;
    const node2Mock = jest.fn() as jest.Mock;

    // Create custom transports with mocks
    const transport1 = custom({
      request: (async ({ method, params }) => {
        // Log the call
        node1Mock(method, params);
        // Forward to the real node
        const transport = http(rpcUrl1)({});
        return await transport.request({ method, params });
      }) as EIP1193RequestFn,
    });

    const transport2 = custom({
      request: (async ({ method, params }) => {
        // Log the call
        node2Mock(method, params);
        // Forward to the real node
        const transport = http(rpcUrl2)({});
        return await transport.request({ method, params });
      }) as EIP1193RequestFn,
    });

    // Create a client with fallback transport
    const client = createWalletClient({
      transport: fallback([transport1, transport2]),
      chain: foundry,
      account,
    }).extend(publicActions);

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

    // Reset the mocks after deployment
    node1Mock.mockClear();
    node2Mock.mockClear();

    // Try to call the contract (read operation) - this should revert
    try {
      await client.call({
        to: contractAddress,
        data: '0xcafe', // Any data will cause a revert since the contract has no functions
      });

      fail('Call should have reverted');
    } catch (error: any) {
      // The error should be from the first node
      expect(error.message).toContain('revert');

      // Verify node1 was called for eth_call
      expect(node1Mock).toHaveBeenCalledWith('eth_call', expect.anything());

      // Verify node2 was NOT called for eth_call - this is the key test
      // If the fallback mechanism worked correctly, it should not try the second node
      // for contract errors
      const node2CallsForEthCall = node2Mock.mock.calls.filter(call => call[0] === 'eth_call');
      expect(node2CallsForEthCall.length).toBe(0);
    }
  });
});
