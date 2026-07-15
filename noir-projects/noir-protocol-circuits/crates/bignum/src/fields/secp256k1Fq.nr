use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global Secp256k1_Fq_PARAMS: BigNumParams<3, 256> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xfffffffffffffffffffffefffffc2f, 0xffffffffffffffffffffffffffffff, 0xffff],
    double_modulus: [
        0x01fffffffffffffffffffffdfffff85e,
        0x01fffffffffffffffffffffffffffffe,
        0x01fffe,
    ],
    redc_param: [0x400000f440, 0x00, 0x400000],
};

#[derive_bignum(3, 256, quote { Secp256k1_Fq_PARAMS })]
pub struct Secp256k1_Fq {
    limbs: [u128; 3],
}
