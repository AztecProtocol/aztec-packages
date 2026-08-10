use ::bignum::BigNum;
pub use ::bignum::{MNT4_753_Fq, MNT4_753_Fr};

use crate::bigcurve::BigCurve;
use crate::bigcurve::BigCurveParams;
use crate::bigcurve::derive_curve_impl;
use crate::scalar_field::ScalarField;

pub global MNT4_753_SCALAR_SLICES: u32 = 189;

pub global MNT4_753_PARAMS: BigCurveParams<MNT4_753_Fq> = BigCurveParams {
    a: MNT4_753_Fq::from_limbs([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    b: MNT4_753_Fq::from_limbs([
        0xad265458e06372009c9a0491678ef4,
        0x773111c36c8b1b4e8f1ece940ef9ea,
        0xc3d8bb21c8d68bb8cfb9db4b8c8fba,
        0xa92c78dc537e51a16703ec9855c77f,
        0x051c596560835df0c9e50a5b59b882,
        0xc9dcae7a016ac5d7748d3313cd8e39,
        0x01373684a8,
    ]),
    offset_generator: [
        MNT4_753_Fq::from_limbs([
            0x510c246334d0b692ebfdecbc2f155a,
            0x669edd973c9f75d414abf9771c08e5,
            0xe6b11168ce5e1d086f77be3bd2f9a2,
            0xb1f8218100d65f377fbd26d3a6988e,
            0x539edab1530d749bcd247576c899a3,
            0xedc83ee021a1ee9f43411098e6ebc9,
            0x0198053389,
        ]),
        MNT4_753_Fq::from_limbs([
            0xd2540c5bc3f03ec7fce3329268f28a,
            0x835a10dff17863aab5f2f6aaa8279c,
            0x0d18abefed5a54fa1e87836a846a20,
            0x1a236617f696768478a6eb5b3d88bb,
            0xd78baeb1da2cb141f90afaf47b9c17,
            0x5d30507a8a28320c6fb0cdca366472,
            0x8db8bdff,
        ]),
    ],
    offset_generator_final: [
        MNT4_753_Fq::from_limbs([
            0x9f1b932380c7d1d69208ad0630a55e,
            0x91b25d55e4f601326417a77c698f0b,
            0x665ad55876b5a6a1773173950580e9,
            0x3787e144c300000735ad97fadbda25,
            0x87ef5da5b8d6ae8b59f8cee7fe28d7,
            0x70bb77548020e10c1391c027cede6f,
            0x1aad225a,
        ]),
        MNT4_753_Fq::from_limbs([
            0x7a6278d6a58f76b32b55466641b1ac,
            0x169b855c66a34c7f84502de94067c7,
            0x8416151ae8190f402ebb9e62e15e33,
            0xb142e87beef99ea7785f6148462a86,
            0x9b3fcb1001b909949e890942ca0504,
            0x2cffc582389b46790bc726a775af65,
            0x0107f18337,
        ]),
    ],
    one: [
        MNT4_753_Fq::from_limbs([
            0xc2ab23be1c24740af0fdeb3b7f1981,
            0xfeff338dd73a5a7eeecfbce7cf95d3,
            0x463d98a4ea009d57aad9716f708885,
            0x6d1ef781d1de4ffb1f806b314c5ad3,
            0xefa5546444d40c82d6a271f1a43862,
            0x450bb76a02d86daaffbaeb69995eb9,
            0x542f1dad,
        ]),
        MNT4_753_Fq::from_limbs([
            0x031ea99cff05e05ec3be2e4a050358,
            0x23036db8fb990a342449caeb92fa6b,
            0x5dea57ef53ee29157bdf1b741aebd4,
            0xee5599dd7c3dfa4100284833115aec,
            0x7fddcdea19cb10b2bf61f37ae2c456,
            0x26e257b175ae94deb9e10aba4ba72f,
            0x4ab64735,
        ]),
    ],
};

pub type MNT4_753Scalar = ScalarField<MNT4_753_SCALAR_SLICES>;

#[derive_curve_impl(quote { MNT4_753_Fq }, quote { MNT4_753_PARAMS })]
pub struct MNT4_753 {
    pub x: MNT4_753_Fq,
    pub y: MNT4_753_Fq,
    pub is_infinity: bool,
}

mod test {
    use bignum::{BigNum, MNT4_753_Fq, MNT4_753_Fr};
    use std::ops::Neg;

    use crate::bigcurve::BigCurve;

    use super::{MNT4_753, MNT4_753_SCALAR_SLICES, MNT4_753Scalar};

    #[test]
    fn check_num_scalar_slices_in_scalar_field() {
        let x = MNT4_753_Fr::zero();
        let max_wnaf_bits: u32 = x.modulus_bits() + 1;

        let scalar_slices = (max_wnaf_bits / 4) + (max_wnaf_bits % 4 != 0) as u32;
        assert(scalar_slices == MNT4_753_SCALAR_SLICES);
    }

    #[test]
    fn test_offset_generators() {
        let one = MNT4_753::one();
        let negone = MNT4_753_Fr::one().neg();
        let scalar = MNT4_753Scalar::from_bignum(negone);
        let final = one.mul(scalar);

        assert(final.eq(one.neg()));
    }

    #[test]
    fn test_hash_to_curve() {
        let r = MNT4_753::hash_to_curve("hello world".as_bytes());

        r.validate_on_curve();
    }

    #[test]
    fn test_msm() {
        let four = MNT4_753_Fr::from(4);
        let p_minus_4_fr = MNT4_753_Fr::modulus() - four;
        let p_minus_4 = MNT4_753Scalar::from_bignum(p_minus_4_fr);
        let p_minus_5_fr = p_minus_4_fr - MNT4_753_Fr::one();
        let p_minus_5 = MNT4_753Scalar::from_bignum(p_minus_5_fr);
        let scalars = [p_minus_4, p_minus_5];
        let a = MNT4_753::one();
        let b = a.neg();
        let points = [a, b];

        let result = MNT4_753::evaluate_linear_expression(points, scalars, [MNT4_753::one().neg()]);

        assert(result.is_infinity);
    }

    #[test]
    unconstrained fn verify_offset_generators() {
        // MNT4-753 cofactor is 1
        crate::utils::derive_offset_generators::verify_offset_generators::<MNT4_753_Fq, MNT4_753_SCALAR_SLICES, MNT4_753>(
            1,
        );
    }

    #[test]
    unconstrained fn test_scalar_field_conversion(seed: [u8; 10]) {
        let num: MNT4_753_Fr = MNT4_753_Fr::derive_from_seed(seed);
        let scalar_field = MNT4_753Scalar::from_bignum(num);
        let bignum = scalar_field.into_bignum();
        assert(bignum == num);
    }
}
