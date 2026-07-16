use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global ED25519_Fq_PARAMS: BigNumParams<3, 255> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xffffffffffffffffffffffffffffed, 0xffffffffffffffffffffffffffffff, 0x7fff],
    double_modulus: [
        0x01ffffffffffffffffffffffffffffda,
        0x01fffffffffffffffffffffffffffffe,
        0xfffe,
    ],
    redc_param: [0x04c0, 0x00, 0x200000],
};

#[derive_bignum(3, 255, quote { ED25519_Fq_PARAMS })]
pub struct ED25519_Fq {
    limbs: [u128; 3],
}
