import type { InitialAccountData } from '@aztec/accounts/testing';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import type { WaitOpts } from '@aztec/aztec.js/contracts';
import type { AccountManager } from '@aztec/aztec.js/wallet';
import type { Fq, Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

interface WalletWithSchnorrAccounts {
  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq, alias?: string): Promise<AccountManager>;
}

export async function deployFundedSchnorrAccounts(
  wallet: WalletWithSchnorrAccounts,
  accountsData: InitialAccountData[],
  waitOptions?: WaitOpts,
) {
  const accountManagers = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accountsData.length; i++) {
    const { secret, salt, signingKey } = accountsData[i];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.send({
      from: AztecAddress.ZERO,
      skipClassPublication: i !== 0,
      wait: waitOptions,
    });
    accountManagers.push(accountManager);
  }
  return accountManagers;
}

export async function registerInitialLocalNetworkAccountsInWallet(
  wallet: WalletWithSchnorrAccounts,
): Promise<AztecAddress[]> {
  const testAccounts = await getInitialTestAccountsData();
  return Promise.all(
    testAccounts.map(async account => {
      return (await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey)).address;
    }),
  );
}
