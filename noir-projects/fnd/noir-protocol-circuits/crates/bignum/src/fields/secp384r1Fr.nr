use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global Secp384r1_Fr_PARAMS: BigNumParams<4, 384> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [
        0x1a0db248b0a77aecec196accc52973,
        0xffffffffffffc7634d81f4372ddf58,
        0xffffffffffffffffffffffffffffff,
        0xffffff,
    ],
    double_modulus: [
        0x01341b6491614ef5d9d832d5998a52e6,
        0x01ffffffffffff8ec69b03e86e5bbeaf,
        0x01fffffffffffffffffffffffffffffe,
        0x01fffffe,
    ],
    redc_param: [0x7c936dd3d62144c4f9a54cceb5a343, 0x0e272c9f82f2348829f9, 0x00, 0x40000000],
};

#[derive_bignum(4, 384, quote { Secp384r1_Fr_PARAMS })]
pub struct Secp384r1_Fr {
    limbs: [u128; 4],
}
