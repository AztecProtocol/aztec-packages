use crate::embedded_curve_ops::{EmbeddedCurvePoint, EmbeddedCurveScalar};
// docs:start:schnorr_verify
pub fn verify_signature<let N: u32>(
    public_key: EmbeddedCurvePoint,
    signature: [u8; 64],
    message: [u8; N]
) -> bool {
    // docs:end:schnorr_verify
    //scalar lo/hi from bytes
    let sig_s = from_bytes_reduce_unsafe(signature, 0);
    let sig_e = from_bytes_reduce_unsafe(signature, 32);
    // pub_key is on Grumpkin curve
    let mut is_ok = (public_key.y * public_key.y == public_key.x * public_key.x * public_key.x - 17)
        & (!public_key.is_infinite);

    if ((sig_s.lo != 0) | (sig_s.hi != 0)) & ((sig_e.lo != 0) | (sig_e.hi != 0)) {
        let (r_is_infinite, result) = calculate_signature_challenge(public_key, sig_s, sig_e, message);

        is_ok = !r_is_infinite;
        for i in 0..32 {
            is_ok &= result[i] == signature[32 + i];
        }
    }
    is_ok
}

pub fn assert_valid_signature<let N: u32>(
    public_key: EmbeddedCurvePoint,
    signature: [u8; 64],
    message: [u8; N]
) {
    //scalar lo/hi from bytes
    let sig_s = from_bytes_reduce_unsafe(signature, 0);
    let sig_e = from_bytes_reduce_unsafe(signature, 32);

    // assert pub_key is on Grumpkin curve
    assert(public_key.y * public_key.y == public_key.x * public_key.x * public_key.x - 17);
    assert(public_key.is_infinite == false);
    // assert signature is not null
    assert((sig_s.lo != 0) | (sig_s.hi != 0));
    assert((sig_e.lo != 0) | (sig_e.hi != 0));

    let (r_is_infinite, result) = calculate_signature_challenge(public_key, sig_s, sig_e, message);

    assert(!r_is_infinite);
    for i in 0..32 {
        assert(result[i] == signature[32 + i]);
    }
}

fn calculate_signature_challenge<let N: u32>(
    public_key: EmbeddedCurvePoint,
    sig_s: EmbeddedCurveScalar,
    sig_e: EmbeddedCurveScalar,
    message: [u8; N]
) -> (bool, [u8; 32]) {
    let g1 = EmbeddedCurvePoint { x: 1, y: 17631683881184975370165255887551781615748388533673675138860, is_infinite: false };
    let r = crate::embedded_curve_ops::multi_scalar_mul([g1, public_key], [sig_s, sig_e]);
    // compare the _hashes_ rather than field elements modulo r
    let pedersen_hash = crate::hash::pedersen_hash([r.x, public_key.x, public_key.y]);
    let pde: [u8; 32] = pedersen_hash.to_be_bytes();

    let mut hash_input = [0; N + 32];
    for i in 0..32 {
        hash_input[i] = pde[i];
    }
    for i in 0..N {
        hash_input[32+i] = message[i];
    }

    let result = crate::hash::blake2s(hash_input);
    (r.is_infinite, result)
}

// Same as EmbeddedCurveScalar::from_bytes but produces a result 'optimistically reduced':
// if the hints are correct, it will be properly reduced.
#[field(bn254)]
    fn from_bytes_reduce_unsafe(bytes: [u8; 64], offset: u32) -> EmbeddedCurveScalar {
    let mut result = EmbeddedCurveScalar::from_bytes(bytes, offset);
    let modulus = EmbeddedCurveScalar { lo: 201385395114098847380338600778089168199, hi: 64323764613183177041862057485226039389 };
    let hi = unsafe {
        crate::field::bn254::lt_32_hint(modulus.hi, result.hi)
    };
    let lo = unsafe {
        crate::field::bn254::lt_32_hint(result.lo, modulus.lo)
    };
    let eq = unsafe {
        crate::field::is_equal_hint(result.hi, modulus.hi)
    };
    if (hi | eq) & !lo {
        result.hi -= modulus.hi;
        result.lo -= modulus.lo;
    } else if hi & lo {
        result.hi -= modulus.hi + 1;
        result.lo += crate::field::bn254::TWO_POW_128 - modulus.lo;
    }
    result
}
