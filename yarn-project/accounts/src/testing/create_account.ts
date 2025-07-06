import {
  type AccountManager,
  FeeJuicePaymentMethod,
  type PXE,
  type WaitForProvenOpts,
  type WaitOpts,
  waitForProven,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { getSchnorrAccount, getSchnorrAccountContractAddress } from '../schnorr/index.js';
import type { InitialAccountData } from './configuration.js';

/**
 * Generate a fixed amount of random schnorr account contract instance.
 */
export async function generateSchnorrAccounts(numberOfAccounts: number) {
  const secrets = Array.from({ length: numberOfAccounts }, () => Fr.random());
  return await Promise.all(
    secrets.map(async secret => {
      const salt = Fr.random();
      return {
        secret,
        signingKey: deriveSigningKey(secret),
        salt,
        address: await getSchnorrAccountContractAddress(secret, salt),
      };
    }),
  );
}

/**
 * Data for deploying funded account.
 */
type DeployAccountData = Pick<InitialAccountData, 'secret' | 'salt'> & {
  /**
   * An optional signingKey if it's not derived from the secret.
   */
  signingKey?: InitialAccountData['signingKey'];
};

/**
 * Deploy schnorr account contract.
 * It will pay for the fee for the deployment itself. So it must be funded with the prefilled public data.
 */
export async function deployFundedSchnorrAccount(
  pxe: PXE,
  account: DeployAccountData,
  opts: WaitOpts & {
    /**
     * Whether or not to skip registering contract class.
     */
    skipClassPublication?: boolean;
  } = { interval: 0.1, skipClassPublication: false },
  waitForProvenOptions?: WaitForProvenOpts,
): Promise<AccountManager> {
  const signingKey = account.signingKey ?? deriveSigningKey(account.secret);
  const accountManager = await getSchnorrAccount(pxe, account.secret, signingKey, account.salt);

  // Pay the fee by the account itself.
  // This only works when the world state is prefilled with the balance for the account in test environment.
  const paymentMethod = new FeeJuicePaymentMethod(accountManager.getAddress());

  const receipt = await accountManager
    .deploy({
      skipClassPublication: opts.skipClassPublication,
      skipInstancePublication: true,
      fee: { paymentMethod },
    })
    .wait(opts);

  if (waitForProvenOptions !== undefined) {
    await waitForProven(pxe, receipt, waitForProvenOptions);
  }

  return accountManager;
}

/**
 * Deploy schnorr account contracts.
 * They will pay for the fees for the deployment themselves. So they must be funded with the prefilled public data.
 */
export async function deployFundedSchnorrAccounts(
  pxe: PXE,
  accounts: DeployAccountData[],
  opts: WaitOpts & {
    /**
     * Whether or not to skip registering contract class.
     */
    skipClassPublication?: boolean;
  } = { interval: 0.1, skipClassPublication: false },
  waitForProvenOptions?: WaitForProvenOpts,
): Promise<AccountManager[]> {
  const accountManagers: AccountManager[] = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accounts.length; i++) {
    accountManagers.push(
      await deployFundedSchnorrAccount(
        pxe,
        accounts[i],
        {
          ...opts,
          skipClassPublication: i !== 0 || opts.skipClassPublication, // Register the contract class at most once.
        },
        waitForProvenOptions,
      ),
    );
  }
  return accountManagers;
}
