use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global Secp256r1_Fq_PARAMS: BigNumParams<3, 256> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xffffffffffffffffffffffff, 0xffff00000001000000000000000000, 0xffff],
    double_modulus: [
        0x01000001fffffffffffffffffffffffe,
        0x01fffe00000001ffffffffffffffffff,
        0x01fffe,
    ],
    redc_param: [0xffffbfffffffc000000000000000c0, 0x3fffffffffffffffbfffffffbfff, 0x400000],
};

#[derive_bignum(3, 256, quote { Secp256r1_Fq_PARAMS })]
pub struct Secp256r1_Fq {
    limbs: [u128; 3],
}
