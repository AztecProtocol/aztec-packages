use crate::{
    constants::{
        AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, CIVC_VK_LENGTH_IN_FIELDS, MEGA_VK_LENGTH_IN_FIELDS,
        ULTRA_VK_LENGTH_IN_FIELDS,
    },
    traits::Empty,
};
use std::meta::derive;

#[derive(Eq)]
pub struct VerificationKey<let N: u32> {
    pub key: [Field; N],
    pub hash: Field,
}

impl<let M: u32> Empty for VerificationKey<M> {
    fn empty() -> Self {
        VerificationKey { hash: 0, key: [0; M] }
    }
}

pub type RollupHonkVerificationKey = VerificationKey<ULTRA_VK_LENGTH_IN_FIELDS>;
pub type HonkVerificationKey = VerificationKey<ULTRA_VK_LENGTH_IN_FIELDS>;
pub type MegaVerificationKey = VerificationKey<MEGA_VK_LENGTH_IN_FIELDS>;
pub type ClientIVCVerificationKey = VerificationKey<CIVC_VK_LENGTH_IN_FIELDS>;
pub type AvmVerificationKey = VerificationKey<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
