use dep::bignum::BigNum;
use dep::bignum::fields::bn254Fq::BN254_Fq_Params;
use std::embedded_curve_ops::{
    EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar, multi_scalar_mul,
};

type F = BigNum<3, 254, BN254_Fq_Params>;

global TWO_POW_120: Field = 0x1000000000000000000000000000000;
global TWO_POW_112: Field = 0x10000000000000000000000000000;

pub(crate) fn scalar_mul(s: Scalar, P: Point) -> Point {
    multi_scalar_mul([P], [s])
}

unconstrained fn __get_x1_split_hint(x: F) -> (u8, Field) {
    let x1_bytes: [u8; 15] = x.limbs[1].to_le_bytes();
    let x1_le_byte_0 = x1_bytes[0];

    let mut x1_bytes_shifted_right = [0; 14];
    for i in 0..14 {
        x1_bytes_shifted_right[i] = x1_bytes[i + 1];
    }

    let mut x1_byte_shifted_right: Field = x1_bytes_shifted_right[13] as Field;
    for i in 0..13 {
        let j = 13 - 1 - i;
        x1_byte_shifted_right = x1_byte_shifted_right * 256 + x1_bytes_shifted_right[j] as Field;
    }
    (x1_le_byte_0, x1_byte_shifted_right)
}

pub(crate) fn bignum_to_scalar(x: F) -> Scalar {
    // We assume the bignum limbs have already been checked to be < 120 bits.
    let (x1_le_byte_0, x1_byte_shifted_right) = unsafe { __get_x1_split_hint(x) };

    let x1_le_byte_0_as_field = x1_le_byte_0 as Field;

    x1_byte_shifted_right.assert_max_bit_size::<112>();

    let x1_check = x1_le_byte_0_as_field + x1_byte_shifted_right * 256;

    assert(x1_check == x.limbs[1]);

    let lo = x.limbs[0] + TWO_POW_120 * x1_le_byte_0_as_field;
    let hi = x1_byte_shifted_right + x.limbs[2] * TWO_POW_112;
    Scalar { lo, hi }
}

#[test]
fn test_bignum_to_scalar() {
    // A bignum is represented by 120-bit (or 15-byte) limbs.
    // A Scalar is represented by two 128-bit (or 16-byte) limbs.
    // Therefore if we define a test bignum as follows, the scalar representation
    // should be:
    // { lo: 0x34000000000000000000000000001234, hi: 0x120000000000000000000000000012 }
    let x_n = F::from_slice(&[0x1234, 0x1234, 0x12]);
    let x_s: Scalar = bignum_to_scalar(x_n);
    assert_eq(x_s.lo, 0x34000000000000000000000000001234);
    assert_eq(x_s.hi, 0x120000000000000000000000000012);
}

#[test]
fn test_powers() {
    assert(TWO_POW_120 == 2.pow_32(120));
    assert(TWO_POW_112 == 2.pow_32(112));
}
