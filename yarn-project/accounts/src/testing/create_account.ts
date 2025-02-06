import { type AccountManager, FeeJuicePaymentMethod, type WaitOpts } from '@aztec/aztec.js';
import { type PXE } from '@aztec/circuit-types';
import { Fr, deriveSigningKey } from '@aztec/circuits.js';

import { getSchnorrAccountContractAddress } from '../schnorr/account_contract.js';
import { getSchnorrAccount } from '../schnorr/index.js';
import { type InitialAccountData } from './configuration.js';

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
    skipClassRegistration?: boolean;
  } = { interval: 0.1, skipClassRegistration: false },
): Promise<AccountManager> {
  const signingKey = account.signingKey ?? deriveSigningKey(account.secret);
  const accountManager = await getSchnorrAccount(pxe, account.secret, signingKey, account.salt);

  // Pay the fee by the account itself.
  // This only works when the world state is prefilled with the balance for the account in test environment.
  const paymentMethod = new FeeJuicePaymentMethod(accountManager.getAddress());

  await accountManager
    .deploy({
      skipClassRegistration: opts.skipClassRegistration,
      skipPublicDeployment: true,
      fee: { paymentMethod },
    })
    .wait(opts);

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
    skipClassRegistration?: boolean;
  } = { interval: 0.1, skipClassRegistration: false },
): Promise<AccountManager[]> {
  return await Promise.all(
    accounts.map((account, i) =>
      deployFundedSchnorrAccount(pxe, account, {
        ...opts,
        skipClassRegistration: i !== 0 || opts.skipClassRegistration, // Register the contract class at most once.
      }),
    ),
  );
}
