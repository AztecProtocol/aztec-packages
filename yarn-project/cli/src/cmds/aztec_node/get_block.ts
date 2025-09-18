import { createAztecNodeClient, createCompatibleClient } from '@aztec/aztec.js';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(
  pxeUrl: string,
  nodeUrl: string,
  maybeBlockNumber: number | undefined,
  debugLogger: Logger,
  log: LogFn,
) {
  const client = await createCompatibleClient(pxeUrl, debugLogger);
  const aztecNode = createAztecNodeClient(nodeUrl);
  const blockNumber = maybeBlockNumber ?? (await aztecNode.getBlockNumber());
  await inspectBlock(client, aztecNode, blockNumber, log, { showTxs: true });
}
