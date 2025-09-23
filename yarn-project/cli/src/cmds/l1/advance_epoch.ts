import { createAztecNodeClient } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import type { LogFn } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

export async function advanceEpoch(l1RpcUrls: string[], nodeUrl: string, log: LogFn) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const rollupAddress = await aztecNode.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);

  const cheat = RollupCheatCodes.create(l1RpcUrls, { rollupAddress }, new DateProvider());

  await cheat.advanceToNextEpoch();
  log(`Warped time to advance to next epoch`);
}
