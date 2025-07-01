import { type L1ContractAddresses, RegistryContract, getL1ContractsConfig, getPublicClient } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';

export async function getL1Config(
  registryAddress: EthAddress,
  l1RpcUrls: string[],
  l1ChainId: number,
  rollupVersion: number | 'canonical' = 'canonical',
): Promise<{ addresses: L1ContractAddresses; config: Awaited<ReturnType<typeof getL1ContractsConfig>> }> {
  const publicClient = getPublicClient({ l1RpcUrls, l1ChainId });
  const addresses = await RegistryContract.collectAddresses(publicClient, registryAddress, rollupVersion);

  const config = await getL1ContractsConfig(publicClient, addresses);

  return {
    addresses,
    config,
  };
}
