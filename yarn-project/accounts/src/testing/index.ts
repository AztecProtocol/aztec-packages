/**
 * The `@aztec/accounts/testing` export provides utility methods for testing, in particular in a local network environment.
 *
 * @packageDocumentation
 */
import { Fr } from '@aztec/aztec.js/fields';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { getSchnorrInitializerlessAccountContractAddress } from '../schnorr/initializerless/index.js';
import { getSchnorrAccountContractAddress } from '../schnorr/private_immutable/index.js';
import {
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
  type InitialAccountData,
  type InitialAccountType,
} from './configuration.js';

export {
  INITIAL_TEST_ACCOUNT_SALTS,
  INITIAL_TEST_ENCRYPTION_KEYS,
  INITIAL_TEST_SECRET_KEYS,
  INITIAL_TEST_SIGNING_KEYS,
  type InitialAccountData,
  type InitialAccountType,
} from './configuration.js';

/** Derives the account contract address for the given type, so it matches the account that gets created. */
function getTestAccountAddress(type: InitialAccountType, secret: Fr, salt: Fr, signingKey?: GrumpkinScalar) {
  return type === 'schnorr'
    ? getSchnorrAccountContractAddress(secret, salt, signingKey)
    : getSchnorrInitializerlessAccountContractAddress(secret, salt, signingKey);
}

/**
 * Gets the basic information for initial test accounts.
 */
export function getInitialTestAccountsData(): Promise<InitialAccountData[]> {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => ({
      secret,
      signingKey: INITIAL_TEST_ENCRYPTION_KEYS[i],
      salt: INITIAL_TEST_ACCOUNT_SALTS[i],
      type: 'schnorr_initializerless' as const,
      address: await getSchnorrInitializerlessAccountContractAddress(
        secret,
        INITIAL_TEST_ACCOUNT_SALTS[i],
        INITIAL_TEST_SIGNING_KEYS[i],
      ),
    })),
  );
}

/**
 * Generate a fixed amount of random schnorr account contract instances of the given type (defaults to
 * initializerless). The returned addresses are derived to match the type so they can be prefunded.
 */
export async function generateSchnorrAccounts(
  numberOfAccounts: number,
  type: InitialAccountType = 'schnorr_initializerless',
): Promise<InitialAccountData[]> {
  const secrets = Array.from({ length: numberOfAccounts }, () => Fr.random());
  return await Promise.all(
    secrets.map(async secret => {
      const salt = Fr.random();
      return {
        secret,
        signingKey: deriveSigningKey(secret),
        salt,
        type,
        address: await getTestAccountAddress(type, secret, salt),
      };
    }),
  );
}
