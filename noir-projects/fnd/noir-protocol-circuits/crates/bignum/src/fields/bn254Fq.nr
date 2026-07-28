use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global BN254_Fq_PARAMS: BigNumParams<3, 254> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0x816a916871ca8d3c208c16d87cfd47, 0x4e72e131a029b85045b68181585d97, 0x3064],
    double_modulus: [
        0x0102d522d0e3951a7841182db0f9fa8e,
        0x019ce5c263405370a08b6d0302b0bb2e,
        0x60c7,
    ],
    redc_param: [0x9785d9f353021bcebb62866fe43944, 0x18988e8129eac1d2961a01cc04eba5, 0x15291d],
};

#[derive_bignum(3, 254, quote { BN254_Fq_PARAMS })]
pub struct BN254_Fq {
    limbs: [u128; 3],
}
