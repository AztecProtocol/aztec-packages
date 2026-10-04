use ::bignum::BigNum;
pub use ::bignum::{Secp384r1_Fq, Secp384r1_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global SECP384r1_PARAM: BigCurveParams<Secp384r1_Fq> = BigCurveParams {
    a: Secp384r1_Fq::from_limbs([
        0xffffff0000000000000000fffffffc,
        0xfffffffffffffffffffffffffffeff,
        0xffffffffffffffffffffffffffffff,
        0xffffff,
    ]),
    b: Secp384r1_Fq::from_limbs([
        0x56398d8a2ed19d2a85c8edd3ec2aef,
        0x9c6efe8141120314088f5013875ac6,
        0xa7e23ee7e4988e056be3f82d19181d,
        0xb3312f,
    ]),
    one: [
        Secp384r1_Fq::from_limbs([
            0x02f25dbf55296c3a545e3872760ab7,
            0x3b628ba79b9859f741e082542a3855,
            0x22be8b05378eb1c71ef320ad746e1d,
            0xaa87ca,
        ]),
        Secp384r1_Fq::from_limbs([
            0x60b1ce1d7e819d7a431d7c90ea0e5f,
            0x1dbd289a147ce9da3113b5f0b8c00a,
            0x4a96262c6f5d9e98bf9292dc29f8f4,
            0x3617de,
        ]),
    ],
    offset_generator: [
        Secp384r1_Fq::from_limbs([
            0xdee8b53219a72478b418684bfc1af7,
            0x488a699352f33fb1f6758be61cd079,
            0x20174b462c6f3648b4b46168543b40,
            0x47684c,
        ]),
        Secp384r1_Fq::from_limbs([
            0xd7c632ec4b12f20a185428288e3685,
            0x5282bf89d2a9fa39723e5a817f5b12,
            0xec66475eace78801321a497dcd8956,
            0x003f60,
        ]),
    ],
    offset_generator_final: [
        Secp384r1_Fq::from_limbs([
            0xb7d314e47ddb07f2ed8fb1a1dcdda2,
            0x9b268cc09fed685b44a9fe4b5e205b,
            0xb17365a9b99b16df848b831b713258,
            0x1bcc57,
        ]),
        Secp384r1_Fq::from_limbs([
            0xe1f5ed44f1159210ba210a6627238e,
            0x408fb1736370b9face4d51135f1742,
            0xa83f456b2efabe78c1bc7e7c148fd9,
            0xc2edd6,
        ]),
    ],
};

pub global SECP384r1_SCALAR_SLICES: u32 = 97;
pub type Secp384r1Scalar = ScalarField<SECP384r1_SCALAR_SLICES>;

#[derive_curve_impl(quote { Secp384r1_Fq }, quote { SECP384r1_PARAM })]
pub struct Secp384r1 {
    pub x: Secp384r1_Fq,
    pub y: Secp384r1_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, Secp384r1_Fq, Secp384r1_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;
    use super::Secp384r1;
    use super::SECP384r1_SCALAR_SLICES;
    use super::Secp384r1Scalar;

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = Secp384r1_Fq::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == SECP384r1_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = Secp384r1::one();
        let negone = Secp384r1_Fr::one().neg();
        let scalar = Secp384r1Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = Secp384r1::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = Secp384r1_Fr::from(4);
        let p_minus_4_fr = Secp384r1_Fr::modulus() - four;
        let p_minus_4 = Secp384r1Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - Secp384r1_Fr::one();
        let p_minus_5 = Secp384r1Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = Secp384r1::one();
        let b = a.neg();
        let points = [a, b];

        let result =
            Secp384r1::evaluate_linear_expression(points, scalars, [Secp384r1::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // Secp384r1 cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<Secp384r1_Fq, SECP384r1_SCALAR_SLICES, Secp384r1>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: Secp384r1_Fr = Secp384r1_Fr::derive_from_seed(seed);
        let scalar_field = Secp384r1Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }
}
