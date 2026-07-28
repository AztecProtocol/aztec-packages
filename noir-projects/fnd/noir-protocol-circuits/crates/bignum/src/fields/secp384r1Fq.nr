use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global Secp384r1_Fq_PARAMS: BigNumParams<4, 384> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [
        0xffffff0000000000000000ffffffff,
        0xfffffffffffffffffffffffffffeff,
        0xffffffffffffffffffffffffffffff,
        0xffffff,
    ],
    double_modulus: [
        0x01fffffe0000000000000001fffffffe,
        0x01fffffffffffffffffffffffffffdfe,
        0x01fffffffffffffffffffffffffffffe,
        0x01fffffe,
    ],
    redc_param: [0x3fffffffffffffffc000000040, 0x4000, 0x00, 0x40000000],
};

#[derive_bignum(4, 384, quote { Secp384r1_Fq_PARAMS })]
pub struct Secp384r1_Fq {
    limbs: [u128; 4],
}
