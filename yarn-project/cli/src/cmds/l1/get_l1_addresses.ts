import { EthAddress } from '@aztec/aztec.js';
import { RegistryContract, type ViemPublicClient, createEthereumChain } from '@aztec/ethereum';
import type { LogFn } from '@aztec/foundation/log';

import { createPublicClient, fallback, http } from 'viem';

export async function getL1Addresses(
  registryAddress: EthAddress,
  rollupVersion: number | bigint | 'canonical',
  rpcUrls: string[],
  chainId: number,
  json: boolean,
  log: LogFn,
) {
  const chain = createEthereumChain(rpcUrls, chainId);
  const publicClient: ViemPublicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(rpcUrls.map(url => http(url))),
    pollingInterval: 100,
  });
  const addresses = await RegistryContract.collectAddresses(publicClient, registryAddress.toString(), rollupVersion);

  if (json) {
    log(JSON.stringify(addresses, null, 2));
  } else {
    for (const [key, value] of Object.entries(addresses)) {
      log(`${key}: ${value.toString()}`);
    }
  }
}
