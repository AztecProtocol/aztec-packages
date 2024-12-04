import { createCompatibleClient } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type LogFn, type Logger } from '@aztec/foundation/log';

export async function getCurrentBaseFee(rpcUrl: string, debugLogger: Logger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const fees = await client.getCurrentBaseFees();
  log(`Current fees: ${jsonStringify(fees)}`);
}
