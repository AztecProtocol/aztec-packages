//! Blurb sourced from https://github.com/arkworks-rs
//! This library implements the base field of the MNT4_753 curve generated in
//! [[BCTV14]](https://eprint.iacr.org/2014/595). The name denotes that it is a
//! Miyaji--Nakabayashi--Takano curve of embedding degree 4, defined over a
//! 753-bit (prime) field. The main feature of this curve is that its scalar
//! field and base field respectively equal the base field and scalar field of
//! MNT6_753.
//!
//! Curve information:
//! * Base field: q = 0x01C4C62D92C41110229022EEE2CDADB7F997505B8FAFED5EB7E8F96C97D87307FDB925E8A0ED8D99D124D9A15AF79DB117E776F218059DB80F0DA5CB537E38685ACCE9767254A4638810719AC425F0E39D54522CDD119F5E9063DE245E8001
//! * Scalar field: r = 0x01C4C62D92C41110229022EEE2CDADB7F997505B8FAFED5EB7E8F96C97D87307FDB925E8A0ED8D99D124D9A15AF79DB26C5C28C859A99B3EEBCA9429212636B9DFF97634993AA4D6C381BC3F0057974EA099170FA13A4FD90776E240000001
//! * valuation(q - 1, 2) = 15
//! * valuation(r - 1, 2) = 30
//! * G1 curve equation: y^2 = x^3 + ax + b, where
//!    * a = 2
//!    * b = 0x01373684A8C9DCAE7A016AC5D7748D3313CD8E39051C596560835DF0C9E50A5B59B882A92C78DC537E51A16703EC9855C77FC3D8BB21C8D68BB8CFB9DB4B8C8FBA773111C36C8B1B4E8F1ECE940EF9EAAD265458E06372009C9A0491678EF4
//! * G2 curve equation: y^2 = x^3 + Ax + B, where
//!    * A = Fq2 = (a * NON_RESIDUE, 0)
//!    * B = Fq2(0, b * NON_RESIDUE)
//!    * NON_RESIDUE = 13 is the quadratic non-residue used to conpub struct  the
//!      extension field Fq2
use crate::bignum::BigNum;
use crate::bignum::derive_bignum;
use crate::params::BigNumParams;

pub global MNT4_753_Fq_PARAMS: BigNumParams<7, 753> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [
        0x9d54522cdd119f5e9063de245e8001,
        0xcce9767254a4638810719ac425f0e3,
        0x76f218059db80f0da5cb537e38685a,
        0xe8a0ed8d99d124d9a15af79db117e7,
        0x8fafed5eb7e8f96c97d87307fdb925,
        0xc41110229022eee2cdadb7f997505b,
        0x01c4c62d92,
    ],
    double_modulus: [
        0x013aa8a459ba233ebd20c7bc48bd0002,
        0x0199d2ece4a948c71020e335884be1c6,
        0x01ede4300b3b701e1b4b96a6fc70d0b4,
        0x01d141db1b33a249b342b5ef3b622fcd,
        0x011f5fdabd6fd1f2d92fb0e60ffb724a,
        0x01882220452045ddc59b5b6ff32ea0b6,
        0x03898c5b24,
    ],
    redc_param: [
        0x7732576a460d27d25968abba3f5d42,
        0x08dcadd560309f1347c7d5ea5a8451,
        0x60c9b8f015490661278f1c5c76148a,
        0xc0383b7865972fdcbc2aa6fc0d1e75,
        0xfee4cb2b8aaea69745f07fdcd4e2e8,
        0x09c9f1babbce015aaa82abb6c15d19,
        0x90be45b3ea,
    ],
};

#[derive_bignum(7, 753, quote { MNT4_753_Fq_PARAMS })]
pub struct MNT4_753_Fq {
    limbs: [u128; 7],
}
