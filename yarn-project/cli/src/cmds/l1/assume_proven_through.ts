import { createPXEClient, makeFetch } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import type { LogFn } from '@aztec/foundation/log';

export async function assumeProvenThrough(
  blockNumberOrLatest: number | undefined,
  l1RpcUrls: string[],
  rpcUrl: string,
  log: LogFn,
) {
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([], true));
  const rollupAddress = await pxe.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);
  const blockNumber = blockNumberOrLatest ?? (await pxe.getBlockNumber());

  const rollupCheatCodes = RollupCheatCodes.create(l1RpcUrls, { rollupAddress });

  await rollupCheatCodes.markAsProven(blockNumber);
  log(`Assumed proven through block ${blockNumber}`);
}
