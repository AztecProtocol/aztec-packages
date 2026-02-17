import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getCurrentMinFee(nodeUrl: string, debugLogger: Logger, log: LogFn) {
  const node = createAztecNodeClient(nodeUrl);
  const fees = await node.getCurrentMinFees();
  log(`Current fees: ${jsonStringify(fees)}`);
}
