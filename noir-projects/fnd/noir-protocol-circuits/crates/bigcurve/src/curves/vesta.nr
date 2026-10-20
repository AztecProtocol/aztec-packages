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
            0xce2505c853426b2a32b6e16f0ac38f,
            0x94804ec7d20f7cf05490786d8dff36,
            0x1612,
        ]),
        Vesta_Fq::from_limbs([
            0xbeadc3ec872e0750b779e99842a02c,
            0xbc22d7eb3cc8a8744bd068aecf3ad9,
            0x0c2a,
        ]),
    ],
    offset_generator_final: [
        Vesta_Fq::from_limbs([
            0x5907abc0a2effefafc429b3d8b2fc6,
            0x75e4488391410ebad448c1dba4b716,
            0x38f3,
        ]),
        Vesta_Fq::from_limbs([
            0x4c3b9e7bb881e27d31eec9f98420f3,
            0x8a1c27f87a24222c774811dbdcb9ea,
            0x0bdd,
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
