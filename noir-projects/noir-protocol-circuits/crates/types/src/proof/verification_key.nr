use crate::{
    constants::{
        AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    },
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct VerificationKey<let N: u32> {
    pub key: [Field; N],
    pub hash: Field,
}

impl<let N: u32> Empty for VerificationKey<N> {
    fn empty() -> Self {
        VerificationKey { hash: 0, key: [0; N] }
    }
}

pub type RollupHonkVerificationKey = VerificationKey<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type HonkVerificationKey = VerificationKey<HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type ClientIVCVerificationKey = VerificationKey<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type AvmVerificationKey = VerificationKey<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
