import { createAztecNodeClient, createCompatibleClient } from '@aztec/aztec.js';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(rpcUrl: string, maybeBlockNumber: number | undefined, log: LogFn) {
  const node = await createAztecNodeClient(rpcUrl);
  const blockNumber = maybeBlockNumber ?? (await node.getBlockNumber());
  await inspectBlock(client, blockNumber, log, { showTxs: true });
}
