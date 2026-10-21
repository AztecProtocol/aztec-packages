use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global ED25519_Fr_PARAMS: BigNumParams<3, 253> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xdef9dea2f79cd65812631a5cf5d3ed, 0x14, 0x1000],
    double_modulus: [
        0x01bdf3bd45ef39acb024c634b9eba7da,
        0x01000000000000000000000000000028,
        0x1fff,
    ],
    redc_param: [0x06215d086329a7ed9ce5a30a2c131b, 0xffffffffffffffffffffffffffeb21, 0x0fffff],
};

#[derive_bignum(3, 253, quote { ED25519_Fr_PARAMS })]
pub struct ED25519_Fr {
    limbs: [u128; 3],
}
