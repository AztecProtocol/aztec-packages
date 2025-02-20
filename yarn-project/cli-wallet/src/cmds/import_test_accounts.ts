import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js';
import type { PXE } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn } from '@aztec/foundation/log';

import type { WalletDB } from '../storage/wallet_db.js';

export async function importTestAccounts(client: PXE, db: WalletDB, json: boolean, log: LogFn) {
  const testAccounts = await getInitialTestAccounts();
  const accounts = await Promise.all(
    testAccounts.map(({ secret, signingKey, salt }) => getSchnorrAccount(client, secret, signingKey, salt)),
  );

  const out: Record<string, any> = {};
  await Promise.all(
    accounts.map(async (account, i) => {
      const alias = `test${i}`;
      const secret = testAccounts[i].secret;
      const salt = new Fr(account.salt);
      const address = account.getAddress();
      await account.register();
      await db.storeAccount(address, { type: 'schnorr', secretKey: secret, salt, alias, publicKey: undefined }, log);

      if (json) {
        out[alias] = {
          alias,
          address,
          secret,
          salt,
        };
      } else {
        log(`\nTest account:`);
        log(`Alias:           ${alias}`);
        log(`Address:         ${address}`);
        log(`Secret key:      ${secret}`);
        log(`Salt:            ${salt}`);
      }
    }),
  );

  if (json) {
    log(prettyPrintJSON(out));
  } else {
    log(`\n${testAccounts.length} test accounts imported to wallet db.\n`);
  }
}
