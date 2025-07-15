use crate::{
    constants::{
        AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
        HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    },
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Eq)]
pub struct VerificationKey<let N: u32> {
    pub key: [Field; N],
    pub hash: Field,
}

impl<let M: u32> Serialize for VerificationKey<M> {
    let N: u32 = M + 1;

    fn serialize(self) -> [Field; Self::N] {
        let mut fields = [0; Self::N];
        for i in 0..M {
            fields[i] = self.key[i];
        }
        fields[M] = self.hash;
        fields
    }
}

impl<let M: u32> Deserialize for VerificationKey<M> {
    let N: u32 = M + 1;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        let mut key = VerificationKey::empty();
        for i in 0..M {
            key.key[i] = fields[i];
        }
        key.hash = fields[M];
        key
    }
}

impl<let M: u32> Empty for VerificationKey<M> {
    fn empty() -> Self {
        VerificationKey { hash: 0, key: [0; M] }
    }
}

pub type RollupHonkVerificationKey = VerificationKey<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type HonkVerificationKey = VerificationKey<HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type ClientIVCVerificationKey = VerificationKey<CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
pub type AvmVerificationKey = VerificationKey<AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS>;
