use crate::{
    constants::{NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct RecursiveProof {
    pub fields: [Field; RECURSIVE_ROLLUP_HONK_PROOF_LENGTH],
}

impl Empty for RecursiveProof {
    fn empty() -> Self {
        RecursiveProof { fields: [0; RECURSIVE_ROLLUP_HONK_PROOF_LENGTH] }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct NestedRecursiveProof {
    pub fields: [Field; NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH],
}

impl Empty for NestedRecursiveProof {
    fn empty() -> Self {
        NestedRecursiveProof { fields: [0; NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH] }
    }
}

mod test {
    use crate::{
        constants::{NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH},
        proof::rollup_recursive_proof::{NestedRecursiveProof, RecursiveProof},
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_recursive() {
        let item = RecursiveProof::empty();
        // We use the RECURSIVE_ROLLUP_HONK_PROOF_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; RECURSIVE_ROLLUP_HONK_PROOF_LENGTH] = item.serialize();
        let deserialized = RecursiveProof::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn serialization_of_empty_nested() {
        let item = NestedRecursiveProof::empty();
        // We use the NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH] = item.serialize();
        let deserialized = NestedRecursiveProof::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
