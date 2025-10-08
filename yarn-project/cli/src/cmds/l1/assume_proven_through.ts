import { createAztecNodeClient } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import type { LogFn } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

export async function assumeProvenThrough(
  blockNumberOrLatest: number | undefined,
  l1RpcUrls: string[],
  nodeUrl: string,
  log: LogFn,
) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const rollupAddress = await aztecNode.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);
  const blockNumber = blockNumberOrLatest ?? (await aztecNode.getBlockNumber());

  const rollupCheatCodes = RollupCheatCodes.create(l1RpcUrls, { rollupAddress }, new DateProvider());

  await rollupCheatCodes.markAsProven(blockNumber);
  log(`Assumed proven through block ${blockNumber}`);
}
