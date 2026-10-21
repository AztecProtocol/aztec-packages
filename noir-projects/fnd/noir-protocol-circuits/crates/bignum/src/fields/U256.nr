use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global U256_PARAMS: BigNumParams<3, 257> = BigNumParams {
    has_multiplicative_inverse: false,
    modulus: [0x00, 0x00, 0x010000],
    double_modulus: [
        0x01000000000000000000000000000000,
        0xffffffffffffffffffffffffffffff,
        0x01ffff,
    ],
    redc_param: [0x00, 0x00, 0x01000000],
};

#[derive_bignum(3, 257, quote { U256_PARAMS })]
pub struct U256 {
    limbs: [u128; 3],
}
