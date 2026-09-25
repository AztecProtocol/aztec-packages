/**
 * Field moduli and generator points for the curves bb works over, for callers doing their own
 * field arithmetic rather than asking bb.
 *
 * These are properties of the curves, not of any bb build, so they are written out here rather
 * than fetched or generated. `curve_constants.test.ts` checks them against `bb msgpack
 * curve_constants`, which computes the same values from the curve definitions bb is compiled
 * against, so a divergence is caught rather than assumed away.
 *
 * Coordinates are 32-byte big-endian, matching how bb serialises a field element. BN254's G2 is
 * over Fq2, so each of its coordinates is a pair.
 */

function modulus(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

function coord(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** A point with 32-byte big-endian coordinates. */
export type CurvePoint = { readonly x: Uint8Array; readonly y: Uint8Array };
/** A point over a quadratic extension field, each coordinate a pair. */
export type CurvePointFq2 = {
  readonly x: readonly [Uint8Array, Uint8Array];
  readonly y: readonly [Uint8Array, Uint8Array];
};

export const BN254_FR_MODULUS = modulus('30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001');
export const BN254_FQ_MODULUS = modulus('30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47');
export const BN254_G1_GENERATOR: CurvePoint = {
  x: coord('0000000000000000000000000000000000000000000000000000000000000001'),
  y: coord('0000000000000000000000000000000000000000000000000000000000000002'),
};
export const BN254_G2_GENERATOR: CurvePointFq2 = {
  x: [
    coord('1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed'),
    coord('198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2'),
  ],
  y: [
    coord('12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa'),
    coord('090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b'),
  ],
};

// Grumpkin is BN254 with the two fields swapped: its scalar field is BN254's base field.
export const GRUMPKIN_FR_MODULUS = modulus('30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47');
export const GRUMPKIN_FQ_MODULUS = modulus('30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001');
export const GRUMPKIN_G1_GENERATOR: CurvePoint = {
  x: coord('0000000000000000000000000000000000000000000000000000000000000001'),
  y: coord('0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c'),
};

export const SECP256K1_FR_MODULUS = modulus('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
export const SECP256K1_FQ_MODULUS = modulus('fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
export const SECP256K1_G1_GENERATOR: CurvePoint = {
  x: coord('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'),
  y: coord('483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'),
};

export const SECP256R1_FR_MODULUS = modulus('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
export const SECP256R1_FQ_MODULUS = modulus('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
export const SECP256R1_G1_GENERATOR: CurvePoint = {
  x: coord('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  y: coord('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
};
