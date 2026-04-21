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

global GRUMPKIN_P_HI: Field = 0x30644e72e131a029b85045b68181585d;
global GRUMPKIN_P_LO: Field = 0x97816a916871ca8d3c208c16d87cfd47;

fn verify_scalar_within_range(scalar: EmbeddedCurveScalar) -> bool {
    let lo_within_two_pow_128 = scalar.lo.lt(TWO_POW_128);
    let hi_lt_p_hi = scalar.hi.lt(GRUMPKIN_P_HI);
    let lo_lt_p_lo = scalar.lo.lt(GRUMPKIN_P_LO);
    let hi_eq_p_hi = scalar.hi == GRUMPKIN_P_HI;

    lo_within_two_pow_128 & ((hi_lt_p_hi) | (hi_eq_p_hi & lo_lt_p_lo))
}

fn validate_signature(sig_s: EmbeddedCurveScalar, sig_e: EmbeddedCurveScalar) -> bool {
    let sig_s_within_range = verify_scalar_within_range(sig_s);
    let sig_s_non_zero = (sig_s.lo != 0) | (sig_s.hi != 0);
    let sig_e_within_range = verify_scalar_within_range(sig_e);
    let sig_e_non_zero = (sig_e.lo != 0) | (sig_e.hi != 0);

    sig_s_within_range & sig_s_non_zero & sig_e_within_range & sig_e_non_zero
}

fn validate_public_key(pub_key: EmbeddedCurvePoint) -> bool {
    // Validate pubkey on Grumpkin curve: y^2 = x^3 - 17
    let on_curve = (pub_key.y * pub_key.y) == (pub_key.x * pub_key.x * pub_key.x - 17);
    on_curve & (!pub_key.is_infinite)
}

/// Verify a Grumpkin Schnorr signature with a Poseidon2 challenge hash.
///
/// The challenge is computed as:
///   e' = poseidon2_hash_with_separator([R.x, pub_key_x, pub_key_y, ...message], 0)
/// where R = s*G + e*PK.
///
/// Asserts on failure.
/// TODO: make this secure and make sure it doesnt panic on errors.
pub fn verify<let N: u32>(
    pub_key_x: Field,
    pub_key_y: Field,
    signature: Signature,
    message: [Field; N],
) -> bool {
    let pub_key = EmbeddedCurvePoint { x: pub_key_x, y: pub_key_y, is_infinite: false };
    let valid_public_key = validate_public_key(pub_key);

    let sig_s = EmbeddedCurveScalar::new(signature.s_lo, signature.s_hi);
    let sig_e = EmbeddedCurveScalar::new(signature.e_lo, signature.e_hi);
    let valid_signature = validate_signature(sig_s, sig_e);

    if valid_signature & valid_public_key {
        // R = s*G + e*PK
        let r = multi_scalar_mul([G, pub_key], [sig_s, sig_e]);
        let valid_r = !r.is_infinite;

        if valid_r {
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
            e_prime == e_field
        } else {
            false
        }
    } else {
        false
    }
}
