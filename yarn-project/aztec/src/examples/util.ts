import { EthAddress } from '@aztec/aztec.js';
import type { ExtendedViemWalletClient } from '@aztec/ethereum';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import type { Abi, Narrow } from 'abitype';
import type { Hex } from 'viem';

/**
 * Helper function to deploy ETH contracts.
 * @param l1Client - A viem WalletClient extended with public actions.
 * @param abi - The ETH contract's ABI (as abitype's Abi).
 * @param bytecode  - The ETH contract's bytecode.
 * @param args - Constructor arguments for the contract.
 * @returns The ETH address the contract was deployed to.
 */
export async function deployL1Contract(
  l1Client: ExtendedViemWalletClient,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
  args: readonly unknown[] = [],
): Promise<EthAddress> {
  const hash = await l1Client.deployContract({
    abi,
    bytecode,
    args,
  });

  const receipt = await l1Client.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error(`No contract address found in receipt: ${jsonStringify(receipt)}`);
  }

  return EthAddress.fromString(receipt.contractAddress!);
}

/**
 * Sleep for a given number of milliseconds.
 * @param ms - the number of milliseconds to sleep for
 */
export function delay(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
