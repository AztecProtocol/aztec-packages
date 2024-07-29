import { type AztecAddress } from '@aztec/circuits.js';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { createCompatibleClient } from '../../client.js';
import { inspectBlock } from '../../inspect.js';

export async function getBlock(
  account: AztecAddress,
  rpcUrl: string,
  maybeBlockNumber: number | undefined,
  follow: boolean,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const blockNumber = maybeBlockNumber ?? (await client.getBlockNumber());
  await inspectBlock(account, client, blockNumber, log, { showTxs: true });

  if (follow) {
    let lastBlock = blockNumber;
    setInterval(async () => {
      const newBlock = await client.getBlockNumber();
      if (newBlock > lastBlock) {
        const { blocks, notes } = await client.getSyncStatus();
        const areNotesSynced = blocks >= newBlock && Object.values(notes).every(block => block >= newBlock);
        if (areNotesSynced) {
          log('');
          await inspectBlock(account, client, newBlock, log, { showTxs: true });
          lastBlock = newBlock;
        }
      }
    }, 1000);
  }
}
