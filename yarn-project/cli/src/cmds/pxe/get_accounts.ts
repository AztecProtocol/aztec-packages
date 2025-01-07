import { createCompatibleClient } from '@aztec/aztec.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

export async function getAccounts(
  rpcUrl: string,
  json: boolean,
  debugLogger: Logger,
  log: LogFn,
  logJson: (output: any) => void,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const accounts = await client.getRegisteredAccounts();
  if (!accounts.length) {
    if (json) {
      logJson([]);
    } else {
      log('No accounts found.');
    }
    return;
  }
  if (json) {
    logJson(
      accounts.map(a => ({
        address: a.address.toString(),
        publicKeys: a.publicKeys.toString(),
        partialAddress: a.partialAddress.toString(),
      })),
    );
  } else {
    log(`Accounts found: \n`);
    for (const account of accounts) {
      log(account.toReadableString());
    }
  }
}
