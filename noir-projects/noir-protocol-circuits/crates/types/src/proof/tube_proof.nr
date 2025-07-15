use crate::{constants::TUBE_PROOF_LENGTH, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TubeProof {
    pub fields: [Field; TUBE_PROOF_LENGTH],
}

impl Empty for TubeProof {
    fn empty() -> Self {
        TubeProof { fields: [0; TUBE_PROOF_LENGTH] }
    }
}

mod test {
    use crate::{
        constants::TUBE_PROOF_LENGTH,
        proof::tube_proof::TubeProof,
        traits::{Deserialize, Serialize},
    };

    #[test]
    fn serialization_of_tube_proof() {
        let item = TubeProof { fields: [1; TUBE_PROOF_LENGTH] };
        // We use the TUBE_PROOF_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; TUBE_PROOF_LENGTH] = item.serialize();
        let deserialized = TubeProof::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
