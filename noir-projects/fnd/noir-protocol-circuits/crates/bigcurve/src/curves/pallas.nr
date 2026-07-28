use ::bignum::BigNum;
pub use bignum::{Pallas_Fq, Pallas_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global PALLAS_SCALAR_SLICES: u32 = 64;

pub global PALLAS_PARAM: BigCurveParams<Pallas_Fq> = BigCurveParams {
    a: Pallas_Fq::from_limbs([0x00, 0x00, 0x00]),
    b: Pallas_Fq::from_limbs([0x05, 0x00, 0x00]),
    one: [
        Pallas_Fq::from_limbs([0x4698fc094cf91b992d30ed00000000, 0x22, 0x4000]),
        Pallas_Fq::from_limbs([0x02, 0x00, 0x00]),
    ],
    offset_generator: [
        Pallas_Fq::from_limbs([
            0x2ec121a505ace9e56afda9b8cfdebe,
            0x205a6bc9e624e4d9a0216d364993c1,
            0x3e03,
        ]),
        Pallas_Fq::from_limbs([
            0xd32e2dda53d63c52d0bf246f34c5bc,
            0x6a400bb6173f46915669005d5919b6,
            0x06bb,
        ]),
    ],
    offset_generator_final: [
        Pallas_Fq::from_limbs([
            0x165b3f592311649e822ebeac1177e5,
            0xc707dec0fca09ddf0dc06d26d2bf37,
            0x1ca5,
        ]),
        Pallas_Fq::from_limbs([
            0x8acbca03f97328d73ab6a207b99a68,
            0xa2564e1150602960c55ef6d4d0979a,
            0x2186,
        ]),
    ],
};

#[derive_curve_impl(quote { Pallas_Fq }, quote { PALLAS_PARAM })]
pub struct Pallas {
    pub x: Pallas_Fq,
    pub y: Pallas_Fq,
    pub is_infinity: bool,
}

pub type PallasScalar = ScalarField<PALLAS_SCALAR_SLICES>;

mod test {
    use bignum::{BigNum, Pallas_Fq, Pallas_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::{Pallas, PALLAS_SCALAR_SLICES, PallasScalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = Pallas_Fr::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == PALLAS_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = Pallas::one();
        let negone = Pallas_Fr::one().neg();
        let scalar = PallasScalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }
    #[test]
    fn test_hash_to_curve() {
        let r = Pallas::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = Pallas_Fr::from(4);
        let p_minus_4_fr = Pallas_Fr::modulus() - four;
        let p_minus_4 = PallasScalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - Pallas_Fr::one();
        let p_minus_5 = PallasScalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = Pallas::one();
        let b = a.neg();
        let points = [a, b];

        let result = Pallas::evaluate_linear_expression(points, scalars, [Pallas::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // Pallas cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<Pallas_Fq, PALLAS_SCALAR_SLICES, Pallas>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: Pallas_Fr = Pallas_Fr::derive_from_seed(seed);
        let scalar_field = PallasScalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }

}
