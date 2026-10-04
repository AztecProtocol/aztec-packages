use ::bignum::BigNum;
use ::bignum::BLS12_381_Fq;

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global BLS12_381_SCALAR_SLICES: u32 = 64;
pub global BLS12_381_PARAMS: BigCurveParams<BLS12_381_Fq> = BigCurveParams {
    a: BLS12_381_Fq::from_limbs([0x00, 0x00, 0x00, 0x00]),
    b: BLS12_381_Fq::from_limbs([0x04, 0x00, 0x00, 0x00]),
    offset_generator: [
        BLS12_381_Fq::from_limbs([
            0xf8e4e13ca788a1e027ae0cb19244b8,
            0x511b9acb952d9a8cedd85bfb2e8e26,
            0xcfc1981237daaa70115a74c46a1c8a,
            0x1654e5,
        ]),
        BLS12_381_Fq::from_limbs([
            0x4ede6ff96ce6d24ee02fd7d8665ece,
            0x141e5a45c68bc4f0e11e358f8552b2,
            0x709d34db9feacfde6be96e7a2121ed,
            0x143f71,
        ]),
    ],
    offset_generator_final: [
        BLS12_381_Fq::from_limbs([
            0xddc0fb92f86e8c7612aad3025ba89f,
            0xe6a9e12f67f1bd55437a167dc6a069,
            0x8e5e0d2ffdc28f012d9295cc53161f,
            0x050a43,
        ]),
        BLS12_381_Fq::from_limbs([
            0x26734b35e38d840bd6cba9a36112ba,
            0x14b1ec6a82892fcce132d5aebd0e3d,
            0x218257d482b4ce7737078b7ad984de,
            0x094e77,
        ]),
    ],
    one: [
        BLS12_381_Fq::from_limbs([
            0x55e83ff97a1aeffb3af00adb22c6bb,
            0x8c4f9774b905a14e3a3f171bac586c,
            0xa73197d7942695638c4fa9ac0fc368,
            0x17f1d3,
        ]),
        BLS12_381_Fq::from_limbs([
            0x3cc744a2888ae40caa232946c5e7e1,
            0xe095d5d00af600db18cb2c04b3edd0,
            0x81e3aaa0f1a09e30ed741d8ae4fcf5,
            0x08b3f4,
        ]),
    ],
};

pub type BLS12_381Scalar = ScalarField<BLS12_381_SCALAR_SLICES>;

#[derive_curve_impl(quote { BLS12_381_Fq }, quote { BLS12_381_PARAMS })]
pub struct BLS12_381 {
    pub x: BLS12_381_Fq,
    pub y: BLS12_381_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, BLS12_381_Fq, BLS12_381_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::{BLS12_381, BLS12_381_SCALAR_SLICES, BLS12_381Scalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = BLS12_381_Fr::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == BLS12_381_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = BLS12_381::one();
        let negone = BLS12_381_Fr::one().neg();
        let scalar = BLS12_381Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = BLS12_381::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = BLS12_381_Fr::from(4);
        let p_minus_4_fr = BLS12_381_Fr::modulus() - four;
        let p_minus_4 = BLS12_381Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - BLS12_381_Fr::one();
        let p_minus_5 = BLS12_381Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = BLS12_381::one();
        let b = a.neg();
        let points = [a, b];

        let result =
            BLS12_381::evaluate_linear_expression(points, scalars, [BLS12_381::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // BLS12-381 cofactor is 0x396C8C005555E1568C00AAAB0000AAAB
        crate::utils::derive_offset_generators::verify_offset_generators::<BLS12_381_Fq, BLS12_381_SCALAR_SLICES, BLS12_381>(
            0x396C8C005555E1568C00AAAB0000AAAB,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: BLS12_381_Fr = BLS12_381_Fr::derive_from_seed(seed);
        let scalar_field = BLS12_381Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }

}
