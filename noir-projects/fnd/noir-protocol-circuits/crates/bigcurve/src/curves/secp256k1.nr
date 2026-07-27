use ::bignum::BigNum;
use ::bignum::Secp256k1_Fq;

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global SECP256k1_SCALAR_SLICES: u32 = 65;

pub global SECP256k1_PARAM: BigCurveParams<Secp256k1_Fq> = BigCurveParams {
    a: Secp256k1_Fq::from_limbs([0x00, 0x00, 0x00]),
    b: Secp256k1_Fq::from_limbs([0x07, 0x00, 0x00]),
    one: [
        Secp256k1_Fq::from_limbs([
            0x9bfcdb2dce28d959f2815b16f81798,
            0x667ef9dcbbac55a06295ce870b0702,
            0x79be,
        ]),
        Secp256k1_Fq::from_limbs([
            0x17b448a68554199c47d08ffb10d4b8,
            0xda7726a3c4655da4fbfc0e1108a8fd,
            0x483a,
        ]),
    ],
    offset_generator: [
        Secp256k1_Fq::from_limbs([
            0xad9b0399372a80a40485fb4765c830,
            0x592524e36cf8f8b10532990e0c318b,
            0x4130,
        ]),
        Secp256k1_Fq::from_limbs([
            0x0f86d7ffdfd71295914f8c96c8e696,
            0xb2a472eb30ec190dc82c3f416b8c6d,
            0xfedf,
        ]),
    ],
    offset_generator_final: [
        Secp256k1_Fq::from_limbs([
            0xf69e3511e0f28578e8516402091e2d,
            0xa0afbd65c86c4bb7593dace897e155,
            0x4f04,
        ]),
        Secp256k1_Fq::from_limbs([
            0x414e4311b6eaed7bdf0a669162ba0b,
            0x5cccfc054797f3e2b9133b36f2d7a7,
            0x765c,
        ]),
    ],
};

pub type Secp256k1Scalar = ScalarField<SECP256k1_SCALAR_SLICES>;

#[derive_curve_impl(quote { bignum::Secp256k1_Fq }, quote { SECP256k1_PARAM })]
pub struct Secp256k1 {
    pub x: Secp256k1_Fq,
    pub y: Secp256k1_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, Secp256k1_Fq, Secp256k1_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::{Secp256k1, SECP256k1_SCALAR_SLICES, Secp256k1Scalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = Secp256k1_Fq::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == SECP256k1_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = Secp256k1::one();
        let negone = Secp256k1_Fr::one().neg();
        let scalar = Secp256k1Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = Secp256k1::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = Secp256k1_Fr::from(4);
        let p_minus_4_fr = Secp256k1_Fr::modulus() - four;
        let p_minus_4 = Secp256k1Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - Secp256k1_Fr::one();
        let p_minus_5 = Secp256k1Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = Secp256k1::one();
        let b = a.neg();
        let points = [a, b];

        let result =
            Secp256k1::evaluate_linear_expression(points, scalars, [Secp256k1::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // Secp256k1 cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<Secp256k1_Fq, SECP256k1_SCALAR_SLICES, Secp256k1>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: Secp256k1_Fr = Secp256k1_Fr::derive_from_seed(seed);
        let scalar_field = Secp256k1Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }
}
