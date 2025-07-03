import { createPXEClient, makeFetch } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import type { LogFn } from '@aztec/foundation/log';

export async function advanceEpoch(l1RpcUrls: string[], rpcUrl: string, log: LogFn) {
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([], true));
  const rollupAddress = await pxe.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);

  const cheat = RollupCheatCodes.create(l1RpcUrls, { rollupAddress });

  await cheat.advanceToNextEpoch();
  log(`Warped time to advance to next epoch`);
}
