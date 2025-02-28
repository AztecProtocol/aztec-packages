/**
 * The `@aztec/accounts/testing/lazy` export provides utility methods for testing, in particular in a Sandbox environment.
 *
 * Use {@link getInitialTestAccountsWallets} to obtain a list of wallets for the Sandbox pre-seeded accounts.
 *
 * @packageDocumentation
 */
import type { PXE } from '@aztec/aztec.js';
import type { AccountWalletWithSecretKey } from '@aztec/aztec.js/wallet';

import { getSchnorrAccount, getSchnorrAccountContractAddress, getSchnorrWalletWithSecretKey } from '../schnorr/lazy.js';
import {
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
  type InitialAccountData,
} from './configuration.js';

export {
  type InitialAccountData,
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
} from './configuration.js';

/**
 * Gets the basic information for initial test accounts.
 */
export function getInitialTestAccounts(): Promise<InitialAccountData[]> {
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
 * Gets a collection of wallets for the Aztec accounts that are initially stored in the test environment.
 * @param pxe - PXE instance.
 * @returns A set of AccountWallet implementations for each of the initial accounts.
 */
export function getInitialTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]> {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (encryptionKey, i) => {
      const account = await getSchnorrAccount(
        pxe,
        encryptionKey!,
        INITIAL_TEST_SIGNING_KEYS[i]!,
        INITIAL_TEST_ACCOUNT_SALTS[i],
      );
      return account.getWallet();
    }),
  );
}

/**
 * Queries a PXE for it's registered accounts.
 * @param pxe - PXE instance.
 * @returns A set of key data for each of the initial accounts.
 */
export async function getDeployedTestAccounts(pxe: PXE): Promise<InitialAccountData[]> {
  const registeredAccounts = await pxe.getRegisteredAccounts();
  const testAccounts = await getInitialTestAccounts();
  return testAccounts.filter(t => registeredAccounts.some(r => r.address.equals(t.address)));
}

/**
 * Queries a PXE for it's registered accounts and returns wallets for those accounts using keys in the initial test accounts.
 * @param pxe - PXE instance.
 * @returns A set of AccountWallet implementations for each of the initial accounts.
 */
export async function getDeployedTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]> {
  const testAccounts = await getDeployedTestAccounts(pxe);
  return Promise.all(
    testAccounts.map(({ secret, signingKey, salt }) => getSchnorrWalletWithSecretKey(pxe, secret, signingKey, salt)),
  );
}
