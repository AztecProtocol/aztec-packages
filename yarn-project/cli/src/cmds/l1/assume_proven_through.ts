import { createPXEClient, makeFetch } from '@aztec/aztec.js';
import { createEthereumChain, createL1Clients } from '@aztec/ethereum';
import { type LogFn } from '@aztec/foundation/log';

import { setAssumeProvenThrough } from '../../utils/aztec.js';

export async function assumeProvenThrough(
  blockNumberOrLatest: number | undefined,
  l1RpcUrls: string[],
  rpcUrl: string,
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string,
  log: LogFn,
) {
  const chain = createEthereumChain(l1RpcUrls, chainId);
  const { walletClient } = createL1Clients(chain.rpcUrls, privateKey ?? mnemonic, chain.chainInfo);

  const pxe = createPXEClient(rpcUrl, {}, makeFetch([], true));
  const rollupAddress = await pxe.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);
  const blockNumber = blockNumberOrLatest ?? (await pxe.getBlockNumber());

  await setAssumeProvenThrough(blockNumber, rollupAddress, walletClient);
  log(`Assumed proven through block ${blockNumber}`);
}
