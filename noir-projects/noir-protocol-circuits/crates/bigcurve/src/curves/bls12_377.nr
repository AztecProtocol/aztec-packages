use ::bignum::BigNum;
pub use ::bignum::{BLS12_377_Fq, BLS12_377_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global BLS12_377_SCALAR_SLICES: u32 = 64;
pub global BLS12_377_PARAMS: BigCurveParams<BLS12_377_Fq> = BigCurveParams {
    a: BLS12_377_Fq::from_limbs([0x00, 0x00, 0x00, 0x00]),
    b: BLS12_377_Fq::from_limbs([0x01, 0x00, 0x00, 0x00]),
    offset_generator: [
        BLS12_377_Fq::from_limbs([
            0xc4e2f8463e80c87bd7a9f69651dfe0,
            0x49341d9d128c675802c3496fc1a879,
            0xe0f392b1abfeb0de8e4196a879ea2f,
            0x5b8e,
        ]),
        BLS12_377_Fq::from_limbs([
            0xbba4e438914ed9fe4a9a073ddb4f7d,
            0xdb6450e6a9386866a5b25dda5444a4,
            0xaf73be6343612e897e42434072cc63,
            0x43ae,
        ]),
    ],
    offset_generator_final: [
        BLS12_377_Fq::from_limbs([
            0x7cd0635d4db6179568651d3dfd1e6d,
            0x86863e4435596883f2692afac35df7,
            0x389d6e88a3aca1c1bf6018eebba118,
            0x04ed,
        ]),
        BLS12_377_Fq::from_limbs([
            0xc64c3b73c6b653b4fb4987a95149aa,
            0xa5af31754fcfc33ba8c44c2eb300bf,
            0x628a963c67fd7f7203eb4e7ce2f117,
            0x017839,
        ]),
    ],
    one: [
        BLS12_377_Fq::from_limbs([
            0x481512ffcd394eeab9b16eb21be9ef,
            0x1e2caa9d41bb188282c8bd37cb5cd5,
            0xdefe740a67c8fc6225bf87ff548595,
            0x8848,
        ]),
        BLS12_377_Fq::from_limbs([
            0xfe3d3634a9591afd82de55559c8ea6,
            0xb348ca3e52d96d182ad44fb82305c2,
            0x69c5102eff1f674f5d30afeec4bd7f,
            0x01914a,
        ]),
    ],
};

pub type BLS12_377Scalar = ScalarField<BLS12_377_SCALAR_SLICES>;

#[derive_curve_impl(quote { BLS12_377_Fq }, quote { BLS12_377_PARAMS })]
pub struct BLS12_377 {
    pub x: BLS12_377_Fq,
    pub y: BLS12_377_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, BLS12_377_Fq, BLS12_377_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::BLS12_377;
    use super::BLS12_377_SCALAR_SLICES;
    use super::BLS12_377Scalar;

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = BLS12_377_Fr::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == BLS12_377_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = BLS12_377::one();
        let negone = BLS12_377_Fr::one().neg();
        let scalar = BLS12_377Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }
    #[test]
    fn test_hash_to_curve() {
        let r = BLS12_377::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let mut four = BLS12_377_Fr::zero();
        four.set_limb(0, 4);
        let p_minus_4_fr = BLS12_377_Fr::modulus() - four;
        let p_minus_4 = BLS12_377Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - BLS12_377_Fr::one();
        let p_minus_5 = BLS12_377Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = BLS12_377::one();
        let b = a.neg();
        let points = [a, b];

        let result =
            BLS12_377::evaluate_linear_expression(points, scalars, [BLS12_377::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // BLS12-377 cofactor is 0x170b5d44300000000000000000000000
        crate::utils::derive_offset_generators::verify_offset_generators::<BLS12_377_Fq, BLS12_377_SCALAR_SLICES, BLS12_377>(
            0x170b5d44300000000000000000000000,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: BLS12_377_Fr = BLS12_377_Fr::derive_from_seed(seed);
        let scalar_field = BLS12_377Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }
}
