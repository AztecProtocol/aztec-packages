import { createAztecNodeClient } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(nodeUrl: string, maybeBlockNumber: number | undefined, log: LogFn) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const blockNumber = maybeBlockNumber ?? (await aztecNode.getBlockNumber());
  await inspectBlock(aztecNode, blockNumber, log, { showTxs: true });
}
