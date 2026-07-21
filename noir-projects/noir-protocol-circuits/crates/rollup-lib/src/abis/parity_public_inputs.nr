use types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct ParityPublicInputs {
    pub sha_root: Field,
    pub converted_root: Field,
    pub vk_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs { sha_root: 0, converted_root: 0, vk_tree_root: 0, prover_id: 0 }
    }
}
