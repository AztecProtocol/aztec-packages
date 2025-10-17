/**
 * Cryptographic key derivation functions for Aztec accounts.
 *
 * This module implements the hierarchical key derivation scheme used in Aztec for generating
 * various types of cryptographic keys from a master secret. The derivation follows a specific
 * hierarchy to enable privacy, security, and key isolation.
 *
 * @module keys/derivation
 */

import { GeneratorIndex } from '@aztec/constants';
import { Grumpkin, poseidon2HashWithSeparator, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fq, Fr, GrumpkinScalar } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import type { KeyPrefix } from './key_types.js';
import { PublicKeys } from './public_keys.js';
import { getKeyGenerator } from './utils.js';

/**
 * Computes an application-specific nullifier secret key.
 *
 * This function derives a secret key that is unique to a specific application (contract).
 * It allows the same user account to have different nullifier keys for different contracts,
 * enhancing privacy and key isolation.
 *
 * @param masterNullifierSecretKey - The master nullifier secret key for the account
 * @param app - The contract address for which to derive the app-specific key
 * @returns A promise that resolves to the application-specific nullifier secret key
 *
 * @remarks
 * This is a convenience wrapper around `computeAppSecretKey` with the nullifier key prefix.
 *
 * @example
 * ```typescript
 * const appNsk = await computeAppNullifierSecretKey(masterNsk, contractAddress);
 * // Use appNsk for nullifier operations specific to this contract
 * ```
 */
export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinScalar, app: AztecAddress): Promise<Fr> {
  return computeAppSecretKey(masterNullifierSecretKey, app, 'n'); // 'n' is the key prefix for nullifier secret key
}

/**
 * Computes an application-specific secret key for any key type.
 *
 * This is the core function for deriving application-specific keys from master keys.
 * It combines the master secret key with the application address to produce a unique
 * key for that specific application context.
 *
 * @param skM - The master secret key (as a Grumpkin scalar)
 * @param app - The application (contract) address
 * @param keyPrefix - The type of key being derived ('n', 'iv', 'ov', or 't')
 * @returns A promise that resolves to the application-specific secret key
 *
 * @remarks
 * The derivation uses Poseidon2 hashing with domain separation based on key type.
 * The master key is split into high and low components for the hash input.
 *
 * @example
 * ```typescript
 * // Derive nullifier key for a specific app
 * const appKey = await computeAppSecretKey(masterKey, contractAddr, 'n');
 * ```
 */
export function computeAppSecretKey(skM: GrumpkinScalar, app: AztecAddress, keyPrefix: KeyPrefix): Promise<Fr> {
  const generator = getKeyGenerator(keyPrefix);
  return poseidon2HashWithSeparator([skM.hi, skM.lo, app], generator);
}

/**
 * Computes an application-specific outgoing viewing secret key.
 *
 * This derives a Grumpkin scalar from the master outgoing viewing key for use
 * with a specific application, enabling contract-specific encryption operations.
 *
 * @param ovsk - The master outgoing viewing secret key
 * @param app - The application (contract) address
 * @returns A promise that resolves to the application-specific OVSK as a Grumpkin scalar
 *
 * @remarks
 * This function intentionally converts the Poseidon hash output (Fr) to a Grumpkin scalar (Fq).
 * While this doesn't produce a perfectly uniform distribution, the bias is negligible
 * (2 * (q - r) / q is very small) and acceptable for this use case.
 *
 * @example
 * ```typescript
 * const appOvsk = await computeOvskApp(masterOvsk, contractAddress);
 * // Use appOvsk for outgoing viewing operations in this contract
 * ```
 */
export async function computeOvskApp(ovsk: GrumpkinScalar, app: AztecAddress): Promise<Fq> {
  const ovskAppFr = await computeAppSecretKey(ovsk, app, 'ov'); // 'ov' is the key prefix for outgoing viewing key
  // Here we are intentionally converting Fr (output of poseidon) to Fq. This is fine even though a distribution of
  // P = s * G will not be uniform because 2 * (q - r) / q is small.
  return GrumpkinScalar.fromBuffer(ovskAppFr.toBuffer());
}

/**
 * Derives the master nullifier secret key from an account's root secret.
 *
 * This is the first level of key derivation, creating the master key used for
 * generating nullifiers. Nullifiers are used to mark notes as spent without
 * revealing which note was spent.
 *
 * @param secretKey - The root secret key for the account
 * @returns The master nullifier secret key
 *
 * @security
 * The secret key should be generated with high entropy and kept secure.
 * Compromise of this key allows spending all notes owned by the account.
 *
 * @example
 * ```typescript
 * const rootSecret = Fr.random(); // In practice, derive from mnemonic
 * const masterNsk = deriveMasterNullifierSecretKey(rootSecret);
 * ```
 */
export function deriveMasterNullifierSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NSK_M]);
}

/**
 * Derives the master incoming viewing secret key from an account's root secret.
 *
 * This key is used to decrypt and identify notes sent to the account. It enables
 * the account to scan the blockchain for relevant encrypted data.
 *
 * @param secretKey - The root secret key for the account
 * @returns The master incoming viewing secret key
 *
 * @remarks
 * The incoming viewing key can be shared with trusted parties (like a wallet provider)
 * to enable them to detect incoming notes without being able to spend them.
 *
 * @example
 * ```typescript
 * const masterIvsk = deriveMasterIncomingViewingSecretKey(rootSecret);
 * // Use for note discovery and decryption
 * ```
 */
export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

/**
 * Derives the master outgoing viewing secret key from an account's root secret.
 *
 * This key is used to decrypt outgoing transaction data, allowing the sender
 * to reconstruct their transaction history.
 *
 * @param secretKey - The root secret key for the account
 * @returns The master outgoing viewing secret key
 *
 * @remarks
 * The outgoing viewing key enables auditing of sent transactions and is useful
 * for accounting and compliance purposes.
 *
 * @example
 * ```typescript
 * const masterOvsk = deriveMasterOutgoingViewingSecretKey(rootSecret);
 * // Use for decrypting outgoing transaction data
 * ```
 */
export function deriveMasterOutgoingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.OVSK_M]);
}

/**
 * Derives a signing key from the account's root secret.
 *
 * This key is used for signing messages and authentication.
 *
 * @param secretKey - The root secret key for the account
 * @returns The signing key as a Grumpkin scalar
 *
 * @remarks
 * TODO(#5837): This currently reuses the IVSK_M derivation path. A dedicated
 * signing key derivation scheme should be implemented in the future.
 *
 * @example
 * ```typescript
 * const signingKey = deriveSigningKey(rootSecret);
 * // Use for signing authentication messages
 * ```
 */
export function deriveSigningKey(secretKey: Fr): GrumpkinScalar {
  // TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

/**
 * Computes a preaddress from public keys and a partial address.
 *
 * The preaddress is an intermediate value in Aztec's address derivation scheme.
 * It's combined with the incoming viewing public key to produce the final address.
 *
 * @param publicKeysHash - Hash of the account's public keys
 * @param partialAddress - The partial address component
 * @returns A promise that resolves to the preaddress
 *
 * @remarks
 * The preaddress ensures that addresses are deterministically derived from
 * public keys while maintaining unlinkability between different accounts.
 *
 * @example
 * ```typescript
 * const preaddr = await computePreaddress(pubKeysHash, partialAddr);
 * // Use with IVPK to compute final address
 * ```
 */
export function computePreaddress(publicKeysHash: Fr, partialAddress: Fr) {
  return poseidon2HashWithSeparator([publicKeysHash, partialAddress], GeneratorIndex.CONTRACT_ADDRESS_V1);
}

/**
 * Computes an Aztec address from public keys and a partial address.
 *
 * This implements Aztec's deterministic address derivation scheme:
 * 1. Compute preaddress from public keys hash and partial address
 * 2. Derive address point: (preaddress * G) + ivpk_m
 * 3. Extract x-coordinate as the final address
 *
 * @param publicKeys - The account's public keys
 * @param partialAddress - The partial address (deployment-specific component)
 * @returns A promise that resolves to the computed Aztec address
 *
 * @remarks
 * This derivation ensures:
 * - Addresses are deterministically derived from public keys
 * - The address owner can decrypt notes sent to it (using ivsk)
 * - Addresses cannot be linked to their public keys without the partial address
 *
 * @example
 * ```typescript
 * const { publicKeys } = await deriveKeys(secretKey);
 * const address = await computeAddress(publicKeys, partialAddress);
 * ```
 */
export async function computeAddress(publicKeys: PublicKeys, partialAddress: Fr): Promise<AztecAddress> {
  // Given public keys and a partial address, we can compute our address in the following steps.
  // 1. preaddress = poseidon2([publicKeysHash, partialAddress], GeneratorIndex.CONTRACT_ADDRESS_V1);
  // 2. addressPoint = (preaddress * G) + ivpk_m
  // 3. address = addressPoint.x
  const preaddress = await computePreaddress(await publicKeys.hash(), partialAddress);
  const address = await new Grumpkin().add(
    await derivePublicKeyFromSecretKey(new Fq(preaddress.toBigInt())),
    publicKeys.masterIncomingViewingPublicKey,
  );

  return new AztecAddress(address.x);
}

/**
 * Computes the address secret from a preaddress and incoming viewing secret key.
 *
 * The address secret is used to decrypt notes sent to an address. This function
 * ensures the derived secret corresponds to a point with a positive y-coordinate
 * (the canonical form used in Aztec's encryption scheme).
 *
 * @param preaddress - The preaddress value
 * @param ivsk - The incoming viewing secret key
 * @returns A promise that resolves to the address secret
 *
 * @remarks
 * The function computes: addressSecret = preaddress + ivsk (mod Fq)
 *
 * If the resulting point has a negative y-coordinate, the secret is negated
 * to flip the y-coordinate while preserving the x-coordinate (the address).
 * This ensures all encryption uses the positive y-coordinate convention.
 *
 * @example
 * ```typescript
 * const addressSecret = await computeAddressSecret(preaddress, ivsk);
 * // Use addressSecret for note decryption
 * ```
 */
export async function computeAddressSecret(preaddress: Fr, ivsk: Fq) {
  // TLDR; P1 = (h + ivsk) * G
  // if P1.y is pos
  //   S = (h + ivsk)
  // else
  //   S = Fq.MODULUS - (h + ivsk)
  //
  // Given h (our preaddress) and our ivsk, we have two different addressSecret candidates. One encodes to a point with a positive y-coordinate
  // and the other encodes to a point with a negative y-coordinate. We take the addressSecret candidate that is a simple addition of the two Scalars.
  const addressSecretCandidate = ivsk.add(new Fq(preaddress.toBigInt()));
  // We then multiply this secretCandidate by the generator G to create an addressPoint candidate.
  const addressPointCandidate = await derivePublicKeyFromSecretKey(addressSecretCandidate);

  // Because all encryption to addresses is done using a point with the positive y-coordinate, if our addressSecret candidate derives a point with a
  // negative y-coordinate, we use the other candidate by negating the secret. This transformation of the secret simply flips the y-coordinate of the derived point while keeping the x-coordinate the same.
  if (!(addressPointCandidate.y.toBigInt() <= (Fr.MODULUS - 1n) / 2n)) {
    return new Fq(Fq.MODULUS - addressSecretCandidate.toBigInt());
  }

  return addressSecretCandidate;
}

/**
 * Derives a public key from a secret key using the Grumpkin curve.
 *
 * This performs elliptic curve scalar multiplication: publicKey = secretKey * G,
 * where G is the generator point of the Grumpkin curve.
 *
 * @param secretKey - The secret key (Grumpkin scalar)
 * @returns A promise that resolves to the corresponding public key point
 *
 * @remarks
 * Grumpkin is the curve used for cryptographic operations in Aztec because
 * it's efficient to verify in circuits (being the "twisted" curve of BN254).
 *
 * @example
 * ```typescript
 * const sk = GrumpkinScalar.random();
 * const pk = await derivePublicKeyFromSecretKey(sk);
 * ```
 */
export function derivePublicKeyFromSecretKey(secretKey: Fq) {
  const curve = new Grumpkin();
  return curve.mul(curve.generator(), secretKey);
}

/**
 * Derives all master keys from a root secret key.
 *
 * This is the primary key derivation function that generates the complete
 * key hierarchy for an Aztec account from a single root secret. It produces:
 * - Master secret keys (for nullifiers, incoming viewing, outgoing viewing, tagging)
 * - Corresponding master public keys
 * - Public keys bundle for address derivation
 *
 * @param secretKey - The root secret key for the account (typically from a mnemonic)
 * @returns A promise resolving to an object containing all derived keys
 *
 * @remarks
 * Key derivation hierarchy:
 * 1. Root secret → Master secret keys (using SHA-512)
 * 2. Master secret keys → Master public keys (using Grumpkin curve)
 * 3. Public keys → Public keys hash (using Poseidon2)
 *
 * The use of SHA-512 for the first level is intentional - these derivations
 * never occur in-circuit, so we can use a standard hash function.
 *
 * @security
 * The root secret key should be generated with at least 128 bits of entropy
 * and stored securely. Compromise of this key compromises the entire account.
 *
 * @example
 * ```typescript
 * import { Fr } from '@aztec/foundation/fields';
 *
 * // In production, derive from mnemonic
 * const rootSecret = Fr.random();
 *
 * const {
 *   masterNullifierSecretKey,
 *   masterIncomingViewingSecretKey,
 *   masterOutgoingViewingSecretKey,
 *   masterTaggingSecretKey,
 *   publicKeys
 * } = await deriveKeys(rootSecret);
 *
 * // Use public keys to compute address
 * const pubKeysHash = await publicKeys.hash();
 * ```
 *
 * @see {@link https://docs.aztec.network/concepts/accounts/keys | Aztec Keys Documentation}
 */
export async function deriveKeys(secretKey: Fr) {
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey = deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey = deriveMasterOutgoingViewingSecretKey(secretKey);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const masterNullifierPublicKey = await derivePublicKeyFromSecretKey(masterNullifierSecretKey);
  const masterIncomingViewingPublicKey = await derivePublicKeyFromSecretKey(masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = await derivePublicKeyFromSecretKey(masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = await derivePublicKeyFromSecretKey(masterTaggingSecretKey);

  // We hash the public keys to get the public keys hash
  const publicKeys = new PublicKeys(
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
  );

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    publicKeys,
  };
}
