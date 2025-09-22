import { type L1ContractAddresses, RegistryContract, getL1ContractsConfig, getPublicClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';

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

export async function getL1RollupAddressFromEnv(l1RpcUrls: string[], l1ChainId: number) {
  const registryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
  if (!registryAddress || !EthAddress.isAddress(registryAddress)) {
    throw new Error(`Failed to extract registry address`);
  }
  const { addresses } = await getL1Config(EthAddress.fromString(registryAddress), l1RpcUrls, l1ChainId);
  return addresses.rollupAddress;
}
