import type { Logger } from '@aztec/foundation/log';

import { type Hex, type Transaction, decodeFunctionData, getAddress, trim } from 'viem';

// Spire Proposer Multicall constants
export const SPIRE_PROPOSER_ADDRESS = '0x9ccc2f3ecde026230e11a5c8799ac7524f2bb294';
export const SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION = '0x7d38d47e7c82195e6e607d3b0f1c20c615c7bf42';

// EIP-1967 storage slot for implementation address
// keccak256("eip1967.proxy.implementation") - 1 = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
export const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;

// Spire Proposer Multicall ABI
export const SpireProposerAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'proposer', type: 'address' },
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'bytes', name: 'data', type: 'bytes' },
          { internalType: 'uint256', name: 'value', type: 'uint256' },
          { internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
        ],
        internalType: 'struct IProposerMulticall.Call[]',
        name: '_calls',
        type: 'tuple[]',
      },
    ],
    name: 'multicall',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Verifies that a proxy contract points to the expected implementation using EIP-1967.
 * @param publicClient - The viem public client
 * @param proxyAddress - The proxy contract address
 * @param expectedImplementation - The expected implementation address
 * @param logger - Logger instance
 * @returns True if the proxy points to the expected implementation
 */
export async function verifyProxyImplementation(
  publicClient: { getStorageAt: (params: { address: Hex; slot: Hex }) => Promise<Hex | undefined> },
  proxyAddress: Hex,
  expectedImplementation: Hex,
  logger: Logger,
): Promise<boolean> {
  try {
    // Read the EIP-1967 implementation slot
    const implementationData = await publicClient.getStorageAt({
      address: proxyAddress,
      slot: EIP1967_IMPLEMENTATION_SLOT,
    });

    if (!implementationData) {
      logger.warn(`No implementation found in EIP-1967 slot for proxy ${proxyAddress}`);
      return false;
    }

    // The implementation address is stored in the last 20 bytes of the slot
    // We need to extract and normalize it for comparison
    const implementationAddress = getAddress(trim(implementationData));
    const expectedAddress = getAddress(expectedImplementation);

    const matches = implementationAddress.toLowerCase() === expectedAddress.toLowerCase();

    if (!matches) {
      logger.warn(`Proxy implementation mismatch: expected ${expectedAddress}, got ${implementationAddress}`, {
        proxyAddress,
        expectedImplementation,
        actualImplementation: implementationAddress,
      });
    }

    return matches;
  } catch (err) {
    logger.warn(`Failed to verify proxy implementation for ${proxyAddress}: ${err}`);
    return false;
  }
}

/**
 * Attempts to decode transaction as a Spire Proposer Multicall.
 * Spire Proposer is a proxy contract that wraps a single call.
 * Returns the target address and calldata of the wrapped call if validation succeeds.
 * @param tx - The transaction to decode
 * @param publicClient - The viem public client for proxy verification
 * @param logger - Logger instance
 * @returns Object with 'to' and 'data' of the wrapped call, or undefined if validation fails
 */
export async function getCallFromSpireProposer(
  tx: Transaction,
  publicClient: { getStorageAt: (params: { address: Hex; slot: Hex }) => Promise<Hex | undefined> },
  logger: Logger,
): Promise<{ to: Hex; data: Hex } | undefined> {
  const txHash = tx.hash;

  try {
    // Check if transaction is to the Spire Proposer address
    if (!tx.to || tx.to.toLowerCase() !== SPIRE_PROPOSER_ADDRESS.toLowerCase()) {
      logger.trace(`Transaction is not to Spire Proposer address (to: ${tx.to})`, { txHash });
      return undefined;
    }

    // Verify the proxy points to the expected implementation
    const isValidProxy = await verifyProxyImplementation(
      publicClient,
      tx.to as Hex,
      SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
      logger,
    );

    if (!isValidProxy) {
      logger.warn(`Spire Proposer proxy implementation verification failed`, { txHash, to: tx.to });
      return undefined;
    }

    // Try to decode as Spire Proposer multicall
    const { functionName: spireFunctionName, args: spireArgs } = decodeFunctionData({
      abi: SpireProposerAbi,
      data: tx.input,
    });

    // If not multicall, return undefined
    if (spireFunctionName !== 'multicall') {
      logger.warn(`Transaction to Spire Proposer is not multicall (got ${spireFunctionName})`, { txHash });
      return undefined;
    }

    if (spireArgs.length !== 1) {
      logger.warn(`Unexpected number of arguments for Spire Proposer multicall (got ${spireArgs.length})`, {
        txHash,
      });
      return undefined;
    }

    const [calls] = spireArgs;

    // Validate exactly ONE call
    if (calls.length !== 1) {
      logger.warn(`Spire Proposer multicall must contain exactly one call (got ${calls.length})`, { txHash });
      return undefined;
    }

    const call = calls[0];

    // Successfully extracted the single wrapped call
    logger.trace(`Decoded Spire Proposer with single call to ${call.target}`, { txHash });
    return { to: call.target, data: call.data };
  } catch (err) {
    // Any decoding error triggers fallback to trace
    logger.warn(`Failed to decode Spire Proposer: ${err}`, { txHash });
    return undefined;
  }
}
