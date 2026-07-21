use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global U384_PARAMS: BigNumParams<4, 385> = BigNumParams {
    has_multiplicative_inverse: false,
    modulus: [0x00, 0x00, 0x00, 0x01000000],
    double_modulus: [
        0x01000000000000000000000000000000,
        0xffffffffffffffffffffffffffffff,
        0xffffffffffffffffffffffffffffff,
        0x01ffffff,
    ],
    redc_param: [0x00, 0x00, 0x00, 0x0100000000],
};

#[derive_bignum(4, 385, quote { U384_PARAMS })]
pub struct U384 {
    limbs: [u128; 4],
}
