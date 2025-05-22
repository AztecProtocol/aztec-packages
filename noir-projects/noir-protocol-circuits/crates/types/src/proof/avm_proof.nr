use crate::{
    constants::AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
    traits::{Deserialize, Empty, Serialize},
};

pub struct AvmProof {
    pub fields: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED],
}

impl Serialize<AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED> for AvmProof {
    fn serialize(self) -> [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED] {
        self.fields
    }
}

impl Deserialize<AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED> for AvmProof {
    fn deserialize(fields: [Field; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED]) -> Self {
        AvmProof { fields }
    }
}

impl Empty for AvmProof {
    fn empty() -> Self {
        AvmProof { fields: [0; AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED] }
    }
}

impl Eq for AvmProof {
    fn eq(self, other: Self) -> bool {
        (self.fields == other.fields)
    }
}

#[test]
fn serialization_of_empty_recursive() {
    let item = AvmProof::empty();
    let serialized = item.serialize();
    let deserialized = AvmProof::deserialize(serialized);
    assert(item.eq(deserialized));
}
