import { createCompatibleClient } from '@aztec/aztec.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

export async function blockNumber(rpcUrl: string, debugLogger: Logger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const [latestNum, provenNum] = await Promise.all([client.getBlockNumber(), client.getProvenBlockNumber()]);
  log(`Latest block: ${latestNum}`);
  log(`Proven block: ${provenNum}`);
}
