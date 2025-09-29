import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import type { LogFn } from '@aztec/foundation/log';

import type { WalletDB } from '../storage/wallet_db.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function importTestAccounts(wallet: CLIWallet, db: WalletDB, json: boolean, log: LogFn) {
  const testAccounts = await getInitialTestAccountsData();

  const out: Record<string, any> = {};
  await Promise.all(
    testAccounts.map(async (account, i) => {
      const alias = `test${i}`;
      const secret = testAccounts[i].secret;
      const salt = new Fr(account.salt);
      const address = account.address;
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
