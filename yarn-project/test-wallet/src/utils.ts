import type { InitialAccountData } from '@aztec/accounts/testing';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import { AztecAddress, type AztecNode, type WaitOpts } from '@aztec/aztec.js';

import type { BaseTestWallet } from './wallet/test_wallet.js';

/**
 * Deploys the SchnorrAccount contracts backed by prefunded addresses
 * at genesis. This can be directly used to pay for transactions in FeeJuice.
 */
export async function deployFundedSchnorrAccounts(
  wallet: BaseTestWallet,
  aztecNode: AztecNode,
  accountsData: InitialAccountData[],
  waitOptions?: WaitOpts,
) {
  const accountManagers = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accountsData.length; i++) {
    const { secret, salt, signingKey } = accountsData[i];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod
      .send({
        from: AztecAddress.ZERO,
        skipClassPublication: i !== 0, // Publish the contract class at most once.
      })
      .wait(waitOptions);
    accountManagers.push(accountManager);
  }
  return accountManagers;
}

/**
 * Registers the initial sandbox accounts in the wallet.
 * @param wallet - Test wallet to use to register the accounts.
 * @returns Addresses of the registered accounts.
 */
export async function registerInitialSandboxAccountsInWallet(wallet: BaseTestWallet): Promise<AztecAddress[]> {
  const testAccounts = await getInitialTestAccountsData();
  return Promise.all(
    testAccounts.map(async account => {
      return (await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey)).address;
    }),
  );
}
