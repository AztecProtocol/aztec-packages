/**
 * The `@aztec/accounts/testing` export provides utility methods for testing, in particular in a Sandbox environment.
 *
 * Use {@link getInitialTestAccountsWallets} to obtain a list of wallets for the Sandbox pre-seeded accounts.
 *
 * @packageDocumentation
 */
import { Fr, type PXE } from '@aztec/aztec.js';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { getSchnorrAccountContractAddress } from '../schnorr/index.js';
import {
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
  type InitialAccountData,
} from './configuration.js';

export {
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
  type InitialAccountData,
} from './configuration.js';

/**
 * Gets the basic information for initial test accounts.
 */
export function getInitialTestAccountsData(): Promise<InitialAccountData[]> {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => ({
      secret,
      signingKey: INITIAL_TEST_ENCRYPTION_KEYS[i],
      salt: INITIAL_TEST_ACCOUNT_SALTS[i],
      address: await getSchnorrAccountContractAddress(
        secret,
        INITIAL_TEST_ACCOUNT_SALTS[i],
        INITIAL_TEST_SIGNING_KEYS[i],
      ),
    })),
  );
}

/**
 * Queries a PXE for it's registered accounts.
 * @param testWalletOrPxe - Test wallet or pxe instance to use to get the registered accounts.
 * @returns A set of key data for each of the initial accounts.
 */
export async function getDeployedTestAccounts(testWalletOrPxe: { getPxe(): PXE } | PXE): Promise<InitialAccountData[]> {
  const pxe = 'getPxe' in testWalletOrPxe ? testWalletOrPxe.getPxe() : testWalletOrPxe;
  const registeredAccounts = await pxe.getRegisteredAccounts();
  const testAccounts = await getInitialTestAccountsData();
  return testAccounts.filter(t => registeredAccounts.some(r => r.address.equals(t.address)));
}

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
