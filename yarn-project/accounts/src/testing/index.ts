/**
 * The `@aztec/accounts/testing` export provides utility methods for testing, in particular in a local network environment.
 *
 * @packageDocumentation
 */
import { Fr } from '@aztec/aztec.js/fields';
<<<<<<< HEAD
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { getSchnorrInitializerlessAccountContractAddress } from '../schnorr/initializerless/index.js';
import { getSchnorrAccountContractAddress } from '../schnorr/private_immutable/index.js';
=======
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';

import { getSchnorrInitializerlessAccountContractAddress } from '../schnorr/initializerless/index.js';
import { getSchnorrAccountContractAddress } from '../schnorr/private_immutable/index.js';
import { deriveSecretKeyFromSigningKey } from '../utils/key_derivation.js';
>>>>>>> origin/v5-next
import {
  INITIAL_TEST_ACCOUNT_SALTS,
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

/** Derives the account contract address for the given type */
<<<<<<< HEAD
function getTestAccountAddress(type: InitialAccountType, secret: Fr, salt: Fr, signingKey?: GrumpkinScalar) {
  return type === 'schnorr'
    ? getSchnorrAccountContractAddress(secret, salt, signingKey)
    : getSchnorrInitializerlessAccountContractAddress(secret, salt, signingKey);
=======
function getTestAccountAddress(type: InitialAccountType, signingKey: GrumpkinScalar, salt: Fr, secret?: Fr) {
  return type === 'schnorr'
    ? getSchnorrAccountContractAddress(signingKey, salt, secret)
    : getSchnorrInitializerlessAccountContractAddress(signingKey, salt, secret);
>>>>>>> origin/v5-next
}

/**
 * Gets the basic information for initial test accounts.
 */
export function getInitialTestAccountsData(): Promise<InitialAccountData[]> {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => ({
      secret,
      signingKey: INITIAL_TEST_SIGNING_KEYS[i],
      salt: INITIAL_TEST_ACCOUNT_SALTS[i],
      type: 'schnorr_initializerless' as const,
      address: await getSchnorrInitializerlessAccountContractAddress(
<<<<<<< HEAD
        secret,
        INITIAL_TEST_ACCOUNT_SALTS[i],
=======
>>>>>>> origin/v5-next
        INITIAL_TEST_SIGNING_KEYS[i],
        INITIAL_TEST_ACCOUNT_SALTS[i],
        secret,
      ),
    })),
  );
}

/**
 * Generate a fixed amount of random schnorr account contract instances of the given type
 */
export async function generateSchnorrAccounts(
  numberOfAccounts: number,
  type: InitialAccountType = 'schnorr_initializerless',
): Promise<InitialAccountData[]> {
<<<<<<< HEAD
  const secrets = Array.from({ length: numberOfAccounts }, () => Fr.random());
=======
  const signingKeys = Array.from({ length: numberOfAccounts }, () => GrumpkinScalar.random());
>>>>>>> origin/v5-next
  return await Promise.all(
    signingKeys.map(async signingKey => {
      const salt = Fr.random();
      const secret = await deriveSecretKeyFromSigningKey(signingKey);
      return {
        secret,
        signingKey,
        salt,
        type,
<<<<<<< HEAD
        address: await getTestAccountAddress(type, secret, salt),
=======
        address: await getTestAccountAddress(type, signingKey, salt, secret),
>>>>>>> origin/v5-next
      };
    }),
  );
}
