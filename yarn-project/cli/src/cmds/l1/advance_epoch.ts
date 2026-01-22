import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import type { LogFn } from '@aztec/foundation/log';
import { createLoggerFactory } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

export async function advanceEpoch(l1RpcUrls: string[], nodeUrl: string, log: LogFn) {
  const aztecNode = createAztecNodeClient(nodeUrl, {}, defaultFetch);
  const rollupAddress = await aztecNode.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);

  const loggerFactory = createLoggerFactory();
  const cheat = RollupCheatCodes.create(l1RpcUrls, { rollupAddress }, new DateProvider(), loggerFactory);

  await cheat.advanceToNextEpoch();
  log(`Warped time to advance to next epoch`);
}
