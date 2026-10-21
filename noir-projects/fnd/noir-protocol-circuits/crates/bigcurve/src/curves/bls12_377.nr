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
            0xa52ab89c3935d05da00e61780be4aa,
            0xf24949a1feed85cec8443b7789bc39,
            0x5057a0beb8e19a32c44b780c961bc8,
            0x19678,
        ]),
        BLS12_377_Fq::from_limbs([
            0x7357b9626a43e16075868371b39adc,
            0x2c26c54b20148cda63ddb6de510ca1,
            0x471a0538a52760e7c0208c2526e87f,
            0x5a41,
        ]),
    ],
    offset_generator_final: [
        BLS12_377_Fq::from_limbs([
            0x365bebcb328299e8e4f64a524b9ba4,
            0x2523dc86e99de7013ab9a7c0c6a76f,
            0x4f39b2be830cf613d107e612a5c635,
            0xa01c,
        ]),
        BLS12_377_Fq::from_limbs([
            0xa8f4e2804cf7267857cc12fa0f8f49,
            0xa711ca7eb25ab6889a88fd9785d99d,
            0xf7f2487fe123492f48f43e3e8096e3,
            0x014ae9,
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
