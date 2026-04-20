/**
 * Grumpkin Schnorr signature with Poseidon2 challenge hash.
 *
 * Compatible with the Noir `schnorr::verify` in the asserted_token_contract:
 *   R = s*G + e*PK
 *   e' = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
 *   check e' == e
 *
 * Sign:
 *   k = random nonce
 *   R = k*G
 *   e = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
 *   s = k - e*sk (mod n)
 *   signature = (s, e) split into 128-bit halves
 *
 * Uses the existing BarretenbergSync-backed Grumpkin class for curve ops and
 * @aztec/foundation poseidon2 for the challenge hash.
 */
import { Grumpkin } from '@aztec/foundation/crypto/grumpkin';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';

const TWO_POW_128 = 1n << 128n;

/** Grumpkin Schnorr signature (s, e) split into 128-bit halves to fit BN254 Fields. */
export interface GrumpkinPoseidonSignature {
  sLo: Fr;
  sHi: Fr;
  eLo: Fr;
  eHi: Fr;
}

/** Generates a random Grumpkin keypair. Returns the secret key and public key point. */
export async function generateGrumpkinKeypair(): Promise<{ privateKey: GrumpkinScalar; publicKey: Point }> {
  const privateKey = GrumpkinScalar.random();
  const publicKey = await Grumpkin.mul(Grumpkin.generator, privateKey);
  return { privateKey, publicKey };
}

/** Derives a Grumpkin public key from a secret key. */
export async function deriveGrumpkinPublicKey(privateKey: GrumpkinScalar): Promise<Point> {
  return await Grumpkin.mul(Grumpkin.generator, privateKey);
}

/**
 * Sign a message (array of Fields) with Grumpkin Schnorr using a Poseidon2 challenge.
 *
 * The challenge is: e = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
 * This matches the Noir verify function in asserted_token_contract/src/schnorr.nr.
 */
export async function grumpkinSchnorrSign(
  privateKey: GrumpkinScalar,
  publicKey: Point,
  message: Fr[],
): Promise<GrumpkinPoseidonSignature> {
  // k = random nonce
  let k = GrumpkinScalar.random();
  while (k.isZero()) {
    k = GrumpkinScalar.random();
  }

  // R = k * G
  const R = await Grumpkin.mul(Grumpkin.generator, k);

  // e = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
  const e = await poseidon2HashWithSeparator([R.x, publicKey.x, publicKey.y, ...message], 0);

  // s = k - e * sk (mod order)
  const eBig = e.toBigInt();
  const kBig = k.toBigInt();
  const skBig = privateKey.toBigInt();
  const order = GrumpkinScalar.MODULUS;
  const sBig = (((kBig - ((eBig * skBig) % order)) % order) + order) % order;

  const s = new GrumpkinScalar(sBig);

  return {
    sLo: s.lo,
    sHi: s.hi,
    eLo: new Fr(eBig & (TWO_POW_128 - 1n)),
    eHi: new Fr(eBig >> 128n),
  };
}

/**
 * Verify a Grumpkin Schnorr signature.
 *
 * Recomputes R = s*G + e*PK, then checks the challenge hash matches.
 */
export async function grumpkinSchnorrVerify(
  publicKey: Point,
  signature: GrumpkinPoseidonSignature,
  message: Fr[],
): Promise<boolean> {
  // Reconstruct s and e from 128-bit halves
  const sBig = signature.sLo.toBigInt() + signature.sHi.toBigInt() * TWO_POW_128;
  const eBig = signature.eLo.toBigInt() + signature.eHi.toBigInt() * TWO_POW_128;

  const s = new GrumpkinScalar(sBig);
  const e = new GrumpkinScalar(eBig);

  // R = s*G + e*PK
  const sG = await Grumpkin.mul(Grumpkin.generator, s);
  const ePK = await Grumpkin.mul(publicKey, e);
  const R = await Grumpkin.add(sG, ePK);

  if (R.isInfinite) {
    return false;
  }

  // e' = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
  const ePrime = await poseidon2HashWithSeparator([R.x, publicKey.x, publicKey.y, ...message], 0);

  return ePrime.toBigInt() === eBig;
}
