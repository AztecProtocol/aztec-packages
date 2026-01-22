import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { RollupCheatCodes } from '@aztec/ethereum/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import type { LogFn } from '@aztec/foundation/log';
import { createLoggerFactory } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

export async function assumeProvenThrough(
  checkpointOrLatest: CheckpointNumber | undefined,
  l1RpcUrls: string[],
  nodeUrl: string,
  log: LogFn,
) {
  const aztecNode = createAztecNodeClient(nodeUrl, {}, defaultFetch);
  const rollupAddress = await aztecNode.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);

  const loggerFactory = createLoggerFactory();
  const rollupCheatCodes = RollupCheatCodes.create(l1RpcUrls, { rollupAddress }, new DateProvider(), loggerFactory);

  await rollupCheatCodes.markAsProven(checkpointOrLatest);
  log(`Assumed proven through checkpoint ${checkpointOrLatest ?? 'latest'}`);
}
