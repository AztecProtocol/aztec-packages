use ::bignum::BigNum;
pub use ::bignum::{Vesta_Fq, Vesta_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global VESTA_PARAM: BigCurveParams<Vesta_Fq> = BigCurveParams {
    a: Vesta_Fq::from_limbs([0x00, 0x00, 0x00]),
    b: Vesta_Fq::from_limbs([0x05, 0x00, 0x00]),
    one: [
        Vesta_Fq::from_limbs([0x4698fc0994a8dd8c46eb2100000000, 0x22, 0x4000]),
        Vesta_Fq::from_limbs([0x02, 0x00, 0x00]),
    ],
    offset_generator: [
        Vesta_Fq::from_limbs([
            0x0292e4f0d960b7839ceeb9ddde67a0,
            0x7d56cad674d955675b7d1325a295c8,
            0x2c23,
        ]),
        Vesta_Fq::from_limbs([
            0xcf5a9a7dcb29e00f25ddacaf334bf2,
            0x89f3ee00756edbe58bff3d940a3575,
            0x3c07,
        ]),
    ],
    offset_generator_final: [
        Vesta_Fq::from_limbs([
            0x56c4ead2bbfe224e0466042ba94fcd,
            0x1612b514b2daf2b053ef3a56fa25ad,
            0x3a72,
        ]),
        Vesta_Fq::from_limbs([
            0x33e0fe36b0da773a0405364a5cfeb9,
            0x52e9037a6ed7adcd762d9e2dc57569,
            0x3976,
        ]),
    ],
};

pub global VESTA_SCALAR_SLICES: u32 = 64;
pub type VestaScalar = ScalarField<VESTA_SCALAR_SLICES>;

#[derive_curve_impl(quote { Vesta_Fq }, quote { VESTA_PARAM })]
pub struct Vesta {
    pub x: Vesta_Fq,
    pub y: Vesta_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, Vesta_Fq, Vesta_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;
    use super::{Vesta, VESTA_SCALAR_SLICES, VestaScalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = Vesta_Fq::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == VESTA_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = Vesta::one();
        let negone = Vesta_Fr::one().neg();
        let scalar = VestaScalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = Vesta::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = Vesta_Fr::from(4);
        let p_minus_4_fr = Vesta_Fr::modulus() - four;
        let p_minus_4 = VestaScalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - Vesta_Fr::one();
        let p_minus_5 = VestaScalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = Vesta::one();
        let b = a.neg();
        let points = [a, b];

        let result = Vesta::evaluate_linear_expression(points, scalars, [Vesta::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // Vesta cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<Vesta_Fq, VESTA_SCALAR_SLICES, Vesta>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: Vesta_Fr = Vesta_Fr::derive_from_seed(seed);
        let scalar_field = VestaScalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }
}
