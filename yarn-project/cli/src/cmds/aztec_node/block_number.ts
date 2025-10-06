import { createAztecNodeClient } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';

export async function blockNumber(nodeUrl: string, log: LogFn) {
  const aztecNode = createAztecNodeClient(nodeUrl);
  const [latestNum, provenNum] = await Promise.all([aztecNode.getBlockNumber(), aztecNode.getProvenBlockNumber()]);
  log(`Latest block: ${latestNum}`);
  log(`Proven block: ${provenNum}`);
}
