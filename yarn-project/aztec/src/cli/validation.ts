import { getL1ContractsAddresses, getL1ContractsConfig, getPublicClient } from '@aztec/ethereum';
import type { L1ContractAddresses, L1ContractsConfig } from '@aztec/ethereum';

/**
 * Connects to L1 using the provided L1 RPC URL and reads all addresses and settings from the governance
 * contract. For each key, compares it against the provided config (if it is not empty) and throws on mismatches.
 */
export async function validateL1Config(
  config: L1ContractsConfig & { l1Contracts: L1ContractAddresses } & { l1ChainId: number; l1RpcUrl: string },
) {
  const publicClient = getPublicClient(config);
  const actualAddresses = await getL1ContractsAddresses(publicClient, config.l1Contracts.governanceAddress);

  for (const keyStr in actualAddresses) {
    const key = keyStr as keyof Awaited<ReturnType<typeof getL1ContractsAddresses>>;
    const actual = actualAddresses[key];
    const expected = config.l1Contracts[key];

    if (expected !== undefined && !expected.isZero() && !actual.equals(expected)) {
      throw new Error(`Expected L1 contract address ${key} to be ${expected} but found ${actual}`);
    }
  }

  const actualConfig = await getL1ContractsConfig(publicClient, actualAddresses);
  for (const keyStr in actualConfig) {
    const key = keyStr as keyof Awaited<ReturnType<typeof getL1ContractsConfig>> & keyof L1ContractsConfig;
    const actual = actualConfig[key];
    const expected = config[key];
    if (expected !== undefined && actual !== expected) {
      throw new Error(`Expected L1 setting ${key} to be ${expected} but found ${actual}`);
    }
  }
}
