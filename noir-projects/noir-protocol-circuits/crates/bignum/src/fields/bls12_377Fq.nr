//! Blurb sourced from https://github.com/arkworks-rs
//! This library implements the base field of the BLS12_377 curve generated in [[BCGMMW20, "Zexe"]]((https://eprint.iacr.org/2018/962).
//! The name denotes that it is a Barreto--Lynn--Scott curve of embedding degree
//! 12, defined over a 377-bit (prime) field. The main feature of this curve is
//! that both the scalar field and the base field are highly 2-adic.
//! (This is in contrast to the BLS12_381 curve for which only the scalar field
//! is highly 2-adic.)
//!
//!
//! Curve information:
//! * Base field: q = 258664426012969094010652733694893533536393512754914660539884262666720468348340822774968888139573360124440321458177
//! * Scalar field: r =
//!   8444461749428370424248824938781546531375899335154063827935233455917409239041
//! * valuation(q - 1, 2) = 46
//! * valuation(r - 1, 2) = 47
//! * G1 curve equation: y^2 = x^3 + 1
//! * G2 curve equation: y^2 = x^3 + B, where
//!    * B = Fq2(0, 155198655607781456406391640216936120121836107652948796323930557600032281009004493664981332883744016074664192874906)
use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global BLS12_377_Fq_PARAMS: BigNumParams<4, 377> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [
        0x0b5d44300000008508c00000000001,
        0xd9f300f5138f1ef3622fba09480017,
        0x4617c510eac63b05c06ca1493b1a22,
        0x01ae3a,
    ],
    double_modulus: [
        0x0116ba88600000010a11800000000002,
        0x01b3e601ea271e3de6c45f741290002d,
        0x018c2f8a21d58c760b80d94292763444,
        0x035c73,
    ],
    redc_param: [
        0x5a1de2710a9647e7f56317936bff32,
        0x3799ddac681abcb52236169b40b43b,
        0x43310183a5db0f28160bbd3dceeeb4,
        0x985423,
    ],
};

#[derive_bignum(4, 377, quote { BLS12_377_Fq_PARAMS })]
pub struct BLS12_377_Fq {
    limbs: [u128; 4],
}
