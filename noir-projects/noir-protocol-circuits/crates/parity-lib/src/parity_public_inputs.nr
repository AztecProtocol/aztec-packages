use dep::types::traits::{Deserialize, Empty, Serialize};

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

impl Serialize<3> for ParityPublicInputs {
    fn serialize(self) -> [Field; 3] {
        let mut fields = [0; 3];
        fields[0] = self.sha_root;
        fields[1] = self.converted_root;
        fields[2] = self.vk_tree_root;
        fields
    }
}

impl Deserialize<3> for ParityPublicInputs {
    fn deserialize(fields: [Field; 3]) -> Self {
        ParityPublicInputs {
            sha_root: fields[0],
            converted_root: fields[1],
            vk_tree_root: fields[2],
        }
    }
}
