import { createCompatibleClient } from '@aztec/aztec.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(rpcUrl: string, maybeBlockNumber: number | undefined, debugLogger: Logger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const blockNumber = maybeBlockNumber ?? (await client.getBlockNumber());
  await inspectBlock(client, blockNumber, log, { showTxs: true });
}
