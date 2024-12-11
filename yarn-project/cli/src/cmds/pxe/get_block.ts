import { createCompatibleClient } from '@aztec/aztec.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

import { inspectBlock } from '../../utils/inspect.js';

export async function getBlock(
  rpcUrl: string,
  maybeBlockNumber: number | undefined,
  follow: boolean,
  debugLogger: Logger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const blockNumber = maybeBlockNumber ?? (await client.getBlockNumber());
  await inspectBlock(client, blockNumber, log, { showTxs: true });

  if (follow) {
    let lastBlock = blockNumber;
    setInterval(async () => {
      const newBlock = await client.getBlockNumber();
      if (newBlock > lastBlock) {
        const { blocks } = await client.getSyncStatus();
        if (blocks >= newBlock) {
          log('');
          await inspectBlock(client, newBlock, log, { showTxs: true });
          lastBlock = newBlock;
        }
      }
    }, 1000);
  }
}
