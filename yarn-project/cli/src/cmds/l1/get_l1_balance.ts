import { createEthereumChain } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn } from '@aztec/foundation/log';
import { TestERC20Abi } from '@aztec/l1-artifacts';

import { createPublicClient, fallback, getContract, http } from 'viem';

import { prettyPrintJSON } from '../../utils/commands.js';

export async function getL1Balance(
  who: EthAddress,
  token: EthAddress | undefined,
  l1RpcUrls: string[],
  chainId: number,
  json: boolean,
  log: LogFn,
) {
  const chain = createEthereumChain(l1RpcUrls, chainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(l1RpcUrls.map(url => http(url))),
  });

  let balance = 0n;
  if (token) {
    const gasL1 = getContract({
      address: token.toString(),
      abi: TestERC20Abi,
      client: publicClient,
    });

    balance = await gasL1.read.balanceOf([who.toString()]);
  } else {
    balance = await publicClient.getBalance({
      address: who.toString(),
    });
  }

  if (json) {
    log(prettyPrintJSON({ balance }));
  } else {
    log(`L1 balance of ${who.toString()} is ${balance.toString()}`);
  }
}
