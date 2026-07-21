import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
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

export const INITIAL_TEST_SIGNING_KEYS = [
  GrumpkinScalar.fromHexString('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
  GrumpkinScalar.fromHexString('202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e'),
  GrumpkinScalar.fromHexString('404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e'),
];

export const INITIAL_TEST_ACCOUNT_SALTS = [Fr.ZERO, Fr.ZERO, Fr.ZERO];

/**
 * The schnorr account contract variant a test account uses.
 */
export type InitialAccountType = 'schnorr' | 'schnorr_initializerless';

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
  /**
   * Account contract variant.
   */
  type?: InitialAccountType;
}
