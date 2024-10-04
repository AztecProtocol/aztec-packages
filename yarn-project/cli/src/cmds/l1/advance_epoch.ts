import { CheatCodes, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';

export async function advanceEpoch(l1RpcUrl: string, rpcUrl: string, log: LogFn) {
  const pxe = createPXEClient(rpcUrl, makeFetch([], true));
  const rollupAddress = await pxe.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);

  const cheat = CheatCodes.createRollup(l1RpcUrl, { rollupAddress });

  await cheat.advanceToNextEpoch();
  log(`Warped time to advance to next epoch`);
}
