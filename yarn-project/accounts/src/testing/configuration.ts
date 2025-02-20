import type { PXE } from '@aztec/aztec.js';
import type { AccountWalletWithSecretKey } from '@aztec/aztec.js/wallet';
import type { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { deriveMasterIncomingViewingSecretKey } from '@aztec/circuits.js/keys';
import { Fr } from '@aztec/foundation/fields';
import type { GrumpkinScalar } from '@aztec/foundation/fields';

import {
  getSchnorrAccount,
  getSchnorrAccountContractAddress,
  getSchnorrWalletWithSecretKey,
} from '../schnorr/index.js';

export const INITIAL_TEST_SECRET_KEYS = [
  Fr.fromHexString('2153536ff6628eee01cf4024889ff977a18d9fa61d0e414422f7681cf085c281'),
  Fr.fromHexString('aebd1b4be76efa44f5ee655c20bf9ea60f7ae44b9a7fd1fd9f189c7a0b0cdae'),
  Fr.fromHexString('0f6addf0da06c33293df974a565b03d1ab096090d907d98055a8b7f4954e120c'),
];

export const INITIAL_TEST_ENCRYPTION_KEYS = INITIAL_TEST_SECRET_KEYS.map(secretKey =>
  deriveMasterIncomingViewingSecretKey(secretKey),
);
// TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
export const INITIAL_TEST_SIGNING_KEYS = INITIAL_TEST_ENCRYPTION_KEYS;

export const INITIAL_TEST_ACCOUNT_SALTS = [Fr.ZERO, Fr.ZERO, Fr.ZERO];

/**
 * Data for generating an initial account.
 */
export interface InitialAccountData {
  /**
   * Secret to derive the keys for the account.
   */
  secret: Fr;
  /**
   * Signing key od the account.
   */
  signingKey: GrumpkinScalar;
  /**
   * Contract address salt.
   */
  salt: Fr;
  /**
   * Address of the schnorr account contract.
   */
  address: AztecAddress;
}

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
