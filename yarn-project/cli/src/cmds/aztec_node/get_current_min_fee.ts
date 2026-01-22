import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getCurrentMinFee(nodeUrl: string, debugLogger: Logger, log: LogFn) {
  const node = createAztecNodeClient(nodeUrl, {}, defaultFetch);
  const fees = await node.getCurrentMinFees();
  log(`Current fees: ${jsonStringify(fees)}`);
}
