import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveMasterIncomingViewingSecretKey } from '@aztec/stdlib/keys';

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
