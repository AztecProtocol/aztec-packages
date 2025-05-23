import type { AztecAddress } from '@aztec/aztec.js';
import { createCompatibleClient } from '@aztec/aztec.js';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getAccount(aztecAddress: AztecAddress, rpcUrl: string, debugLogger: Logger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const account = (await client.getRegisteredAccounts()).find(completeAddress =>
    completeAddress.address.equals(aztecAddress),
  );

  if (!account) {
    log(`Unknown account ${aztecAddress.toString()}`);
  } else {
    log(account.toReadableString());
  }
}
