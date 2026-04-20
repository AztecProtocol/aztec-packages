use aztec::protocol::{
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Packable, Serialize},
};
use std::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar, multi_scalar_mul};

/// Grumpkin generator point.
global G: EmbeddedCurvePoint = EmbeddedCurvePoint {
    x: 1,
    y: 17631683881184975370165255887551781615748388533673675138860,
    is_infinite: false,
};

global TWO_POW_128: Field = 0x100000000000000000000000000000000;

/// Grumpkin Schnorr signature (s, e) split into 128-bit halves to fit BN254 Fields.
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Signature {
    pub s_lo: Field,
    pub s_hi: Field,
    pub e_lo: Field,
    pub e_hi: Field,
}

/// Verify a Grumpkin Schnorr signature with a Poseidon2 challenge hash.
///
/// The challenge is computed as:
///   e' = poseidon2_hash_with_separator([R.x, pub_key_x, pub_key_y, ...message], 0)
/// where R = s*G + e*PK.
///
/// Asserts on failure.
/// TODO: make this secure
pub fn verify<let N: u32>(
    pub_key_x: Field,
    pub_key_y: Field,
    signature: Signature,
    message: [Field; N],
) {
    let pub_key = EmbeddedCurvePoint { x: pub_key_x, y: pub_key_y, is_infinite: false };
    let sig_s = EmbeddedCurveScalar::new(signature.s_lo, signature.s_hi);
    let sig_e = EmbeddedCurveScalar::new(signature.e_lo, signature.e_hi);

    // Validate pubkey on Grumpkin curve: y^2 = x^3 - 17
    assert(pub_key.y * pub_key.y == pub_key.x * pub_key.x * pub_key.x - 17, "pubkey not on curve");
    assert(!pub_key.is_infinite, "pubkey is infinite");
    assert((signature.s_lo != 0) | (signature.s_hi != 0), "signature s is zero");
    assert((signature.e_lo != 0) | (signature.e_hi != 0), "signature e is zero");

    // R = s*G + e*PK
    let r = multi_scalar_mul([G, pub_key], [sig_s, sig_e]);
    assert(!r.is_infinite, "R point is infinite");

    // e' = poseidon2_hash_with_separator([R.x, PK.x, PK.y, ...message], 0)
    let mut hash_inputs: [Field; N + 3] = [0; N + 3];
    hash_inputs[0] = r.x;
    hash_inputs[1] = pub_key.x;
    hash_inputs[2] = pub_key.y;
    for i in 0..N {
        hash_inputs[3 + i] = message[i];
    }
    let e_prime = poseidon2_hash_with_separator(hash_inputs, 0);

    // Verify e' == e (reconstruct full field from lo/hi halves)
    let e_field = signature.e_lo + signature.e_hi * TWO_POW_128;
    assert(e_prime == e_field, "invalid signature");
}
