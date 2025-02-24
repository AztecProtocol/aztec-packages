import { EthAddress } from '@aztec/aztec.js';
import { RegistryContract, createEthereumChain } from '@aztec/ethereum';
import type { LogFn } from '@aztec/foundation/log';

import { createPublicClient, http } from 'viem';

export async function getL1Addresses(
  registryAddress: EthAddress,
  rollupVersion: number | bigint | 'canonical',
  rpcUrl: string,
  chainId: number,
  json: boolean,
  log: LogFn,
) {
  const chain = createEthereumChain(rpcUrl, chainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: http(chain.rpcUrl),
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
