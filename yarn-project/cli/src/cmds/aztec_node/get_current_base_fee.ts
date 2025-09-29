import { createAztecNodeClient } from '@aztec/aztec.js';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getCurrentBaseFee(nodeUrl: string, debugLogger: Logger, log: LogFn) {
  const node = createAztecNodeClient(nodeUrl);
  const fees = await node.getCurrentBaseFees();
  log(`Current fees: ${jsonStringify(fees)}`);
}
