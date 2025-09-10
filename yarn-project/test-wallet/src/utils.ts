import type { InitialAccountData } from '@aztec/accounts/testing';
import type { WaitOpts } from '@aztec/aztec.js';

import type { TestWallet } from './test_wallet.js';

/**
 *
 */
export async function deployFundedSchnorrAccounts(
  wallet: TestWallet,
  accountsData: InitialAccountData[],
  waitOptions?: WaitOpts,
) {
  const accountManagers = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accountsData.length; i++) {
    const { secret, salt, signingKey } = accountsData[i];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    await accountManager
      .deploy({
        skipClassPublication: i !== 0, // Publish the contract class at most once.
      })
      .wait(waitOptions);
    accountManagers.push(accountManager);
  }
  return accountManagers;
}
