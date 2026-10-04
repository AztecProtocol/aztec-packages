use ::bignum::BigNum;
pub use ::bignum::{MNT6_753_Fq, MNT6_753_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global MNT6_753_SCALAR_SLICES: u32 = 189;
pub global MNT6_753_PARAMS: BigCurveParams<MNT6_753_Fq> = BigCurveParams {
    a: MNT6_753_Fq::from_limbs([0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    b: MNT6_753_Fq::from_limbs([
        0xba7505ba6fcf2485540b13dfc8468a,
        0xf9a80a95f401867c4e80f4747fde5a,
        0x0fcf2c43d7bf847957c34cca1e3585,
        0xb7985993f62f03b22a9a3c737a1a1e,
        0xbb64b2bb01b10e60a5d5dfe0a25714,
        0x0863c79d56446237ce2e1468d14ae9,
        0x7da285e7,
    ]),
    offset_generator: [
        MNT6_753_Fq::from_limbs([
            0xb70436c17b5573aa95d2e32cdcfd16,
            0xceec5c48e4d178e2ccf61a09ded925,
            0x8fdb8304ca15b7a924b447b2bdc181,
            0x8e10e812fdbfa159b9c774a632d389,
            0x6264a8829d495d44a032308277b2a7,
            0x77a9c105a1b325f1ef8985e2e013af,
            0x64d69e3a,
        ]),
        MNT6_753_Fq::from_limbs([
            0x4ea5bb295de48f174205579402c385,
            0xd0c4aa15f376f3851ad5f8baf6782f,
            0xa1724fbda2c6b27d52e3ff581e7bca,
            0x137a32ac0fa76eae12c7ab56c4d9a9,
            0x3cb7be67984eec560aa6ca16d0a53e,
            0x4b276d178f405e0221e8ab5b785316,
            0x013870b69e,
        ]),
    ],
    offset_generator_final: [
        MNT6_753_Fq::from_limbs([
            0xed9207e6049dd33e0fd8455fb33c1c,
            0x15728c8e05ae58d4e603a24f29bb91,
            0x53869352cfa644e90099e81077bf6d,
            0x86cf2438341eb57e8384a32c000e4f,
            0xceb4f35f45ff20f5a7d76fa1576fda,
            0x9a18096bc66f2314babc2e33ff26bf,
            0x0197f55594,
        ]),
        MNT6_753_Fq::from_limbs([
            0x0dd62a1cd195f2c632b27c31ae4be2,
            0xdc0c2d26039dc586b590dceeb94941,
            0x4867703d83b1da78fc224bf1fe1e2c,
            0x5dca2f959c8074e6f4b91e433e6b44,
            0x4d90e3529c10c662092a4b426ed44c,
            0x09f4da3b4802172df73bc193c7aa6e,
            0xaeef4fb5,
        ]),
    ],
    one: [
        MNT6_753_Fq::from_limbs([
            0x329a6fefa9a1f3f7a1fbd93a7bffb8,
            0x1acbf7da60895b8b3d9d442c4c4123,
            0xe5e3c57b6df120cee3cd9d867e66d1,
            0x0c0d5fc5e818771b931f1d5bdd069c,
            0x131c2437e884c4997fd1dcb409367d,
            0x6e831147412cfb1002284f30338088,
            0x255f8e87,
        ]),
        MNT6_753_Fq::from_limbs([
            0x521df9855687139f0c51754c0ccc49,
            0x4d9992f5cbf4b2cc4c42eff9a5a6c4,
            0x0dc7a593cce5a792e94d0020c335b7,
            0x4c7a18ed9c4bd3c7ed0ffb31c57e61,
            0x2a3585bdd6d7722c6c07d7873bb02d,
            0x6e2eb3fca70dc1063bac3455180120,
            0x0128c02fff,
        ]),
    ],
};

#[derive_curve_impl(quote { MNT6_753_Fq }, quote { MNT6_753_PARAMS })]
pub struct MNT6_753 {
    pub x: MNT6_753_Fq,
    pub y: MNT6_753_Fq,
    pub is_infinity: bool,
}
pub type MNT6_753Scalar = ScalarField<MNT6_753_SCALAR_SLICES>;

mod test {
    use bignum::{BigNum, MNT6_753_Fq, MNT6_753_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::{MNT6_753, MNT6_753_SCALAR_SLICES, MNT6_753Scalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = MNT6_753_Fq::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == MNT6_753_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = MNT6_753::one();
        let negone = MNT6_753_Fr::one().neg();
        let scalar = MNT6_753Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = MNT6_753::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = MNT6_753_Fr::from(4);

        let p_minus_4_fr = MNT6_753_Fr::modulus() - four;
        let p_minus_4 = MNT6_753Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - MNT6_753_Fr::one();
        let p_minus_5 = MNT6_753Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = MNT6_753::one();
        let b = a.neg();
        let points = [a, b];

        let result = MNT6_753::evaluate_linear_expression(points, scalars, [MNT6_753::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // MNT6-753 cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<MNT6_753_Fq, MNT6_753_SCALAR_SLICES, MNT6_753>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: MNT6_753_Fr = MNT6_753_Fr::derive_from_seed(seed);
        let scalar_field = MNT6_753Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }

}
