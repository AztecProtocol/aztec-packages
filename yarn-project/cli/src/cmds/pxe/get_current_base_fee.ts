import { createCompatibleClient } from '@aztec/aztec.js';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

export async function getCurrentBaseFee(rpcUrl: string, debugLogger: DebugLogger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const fees = await client.getCurrentBaseFees();
  log(`Current fees: ${JSON.stringify(fees.toJSON())}`);
}
