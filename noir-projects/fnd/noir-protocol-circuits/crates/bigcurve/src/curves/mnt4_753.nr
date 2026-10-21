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
            0xd1b925a93536c2a96c58464c423d6e,
            0xb6e05a3301c34ec8a77789e6075417,
            0xdd2a3e6ec8b712f044a6f0d0044a10,
            0x708ae0fc480d578f35b497338cb52b,
            0x80c2db669bca869c2a333cdfd990e0,
            0x14ba4686528d1797d191dbd1154f19,
            0x01c31273fc,
        ]),
        MNT4_753_Fq::from_limbs([
            0x6606088cbe331841e98f87305e590f,
            0x0b481c532417d626c158a0b5b1df11,
            0xd0e314fb2b43c5fecf68dbc836404e,
            0xd097b70f08324a2f4df461131eafb6,
            0x765c8762dc530b63efbc5e2f75b45a,
            0xa804a09f8cf1ff866f03393deb2fb0,
            0x1beab1acc,
        ]),
    ],
    offset_generator_final: [
        MNT4_753_Fq::from_limbs([
            0x45ad7d3882ed9f3435b345f317efca,
            0x2985bc3d32443f1c873901cbdef67c,
            0xc20736e5c29faa6676c0a423008b50,
            0x7126a2720a10d2550a240e11b88881,
            0xdaa153f1b6b10992900dc2b9d2ccf6,
            0x0e4ec5c0d6dad32a292b1566c53c5c,
            0x6a0f8aea,
        ]),
        MNT4_753_Fq::from_limbs([
            0xfe140cedac3a383f2bb17e21a08e95,
            0x790c8c67cb6ff0857f5c0806f8382b,
            0x6c658e1bdaa695f32ca84ea4e5d27b,
            0x81662621e7dc2fd94e2c0072fb1dfe,
            0x762a75820e1163c6ba07fc67b2dd66,
            0x37692eb499833f2ade096453b8cdca,
            0x004c4c8b94,
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
