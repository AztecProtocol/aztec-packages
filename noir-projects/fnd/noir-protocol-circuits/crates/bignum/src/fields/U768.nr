use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global U768_PARAMS: BigNumParams<7, 769> = BigNumParams {
    has_multiplicative_inverse: false,
    modulus: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01000000000000],
    double_modulus: [
        0x01000000000000000000000000000000,
        0xffffffffffffffffffffffffffffff,
        0xffffffffffffffffffffffffffffff,
        0xffffffffffffffffffffffffffffff,
        0xffffffffffffffffffffffffffffff,
        0xffffffffffffffffffffffffffffff,
        0x01ffffffffffff,
    ],
    redc_param: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0100000000000000],
};

#[derive_bignum(7, 769, quote { U768_PARAMS })]
pub struct U768 {
    limbs: [u128; 7],
}
