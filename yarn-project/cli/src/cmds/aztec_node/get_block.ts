import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import type { LogFn } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(nodeUrl: string, maybeBlockNumber: number | undefined, log: LogFn) {
  const aztecNode = createAztecNodeClient(nodeUrl, {}, defaultFetch);
  const blockNumber: BlockNumber = maybeBlockNumber ? BlockNumber(maybeBlockNumber) : await aztecNode.getBlockNumber();
  await inspectBlock(aztecNode, blockNumber, log, { showTxs: true });
}
