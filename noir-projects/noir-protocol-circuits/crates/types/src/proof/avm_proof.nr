use crate::{constants::AVM_PROOF_LENGTH_IN_FIELDS, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct AvmProof {
    pub fields: [Field; AVM_PROOF_LENGTH_IN_FIELDS],
}

impl Empty for AvmProof {
    fn empty() -> Self {
        AvmProof { fields: [0; AVM_PROOF_LENGTH_IN_FIELDS] }
    }
}

mod test {
    use crate::{
        constants::AVM_PROOF_LENGTH_IN_FIELDS,
        proof::avm_proof::AvmProof,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_avm_proof() {
        let item = AvmProof::empty();
        // We use the AVM_PROOF_LENGTH_IN_FIELDS constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; AVM_PROOF_LENGTH_IN_FIELDS] = item.serialize();
        let deserialized = AvmProof::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
