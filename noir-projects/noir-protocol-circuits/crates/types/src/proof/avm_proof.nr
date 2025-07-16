use crate::{
    constants::AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmProof {
    pub fields: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
}

impl Empty for AvmProof {
    fn empty() -> Self {
        AvmProof { fields: [0; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED] }
    }
}
