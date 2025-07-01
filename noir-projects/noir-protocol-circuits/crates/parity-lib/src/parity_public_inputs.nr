use dep::types::traits::{Deserialize, Empty, Serialize};

#[derive(Deserialize, Serialize)]
pub struct ParityPublicInputs {
    pub sha_root: Field,
    pub converted_root: Field,
    pub vk_tree_root: Field,
}

impl Eq for ParityPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.sha_root == other.sha_root)
            & (self.converted_root == other.converted_root)
            & (self.vk_tree_root == other.vk_tree_root)
    }
}
impl Empty for ParityPublicInputs {
    fn empty() -> Self {
        ParityPublicInputs { sha_root: 0, converted_root: 0, vk_tree_root: 0 }
    }
}
