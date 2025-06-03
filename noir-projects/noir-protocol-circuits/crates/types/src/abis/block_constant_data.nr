use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    constants::BLOCK_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct BlockConstantData {
    // Archive tree snapshot at the very beginning of the entire block.
    pub last_archive: AppendOnlyTreeSnapshot,
    // L1toL2Message tree snapshot at the very beginning of the entire block.
    pub last_l1_to_l2: AppendOnlyTreeSnapshot,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub global_variables: GlobalVariables,
}

impl Eq for BlockConstantData {
    fn eq(self, other: BlockConstantData) -> bool {
        self.last_archive.eq(other.last_archive)
            & self.last_l1_to_l2.eq(other.last_l1_to_l2)
            & self.vk_tree_root.eq(other.vk_tree_root)
            & self.protocol_contract_tree_root.eq(other.protocol_contract_tree_root)
            & self.global_variables.eq(other.global_variables)
    }
}

impl Empty for BlockConstantData {
    fn empty() -> Self {
        BlockConstantData {
            last_archive: AppendOnlyTreeSnapshot::empty(),
            last_l1_to_l2: AppendOnlyTreeSnapshot::empty(),
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
            global_variables: GlobalVariables::empty(),
        }
    }
}

impl Serialize<BLOCK_CONSTANT_DATA_LENGTH> for BlockConstantData {
    fn serialize(self) -> [Field; BLOCK_CONSTANT_DATA_LENGTH] {
        let mut fields: BoundedVec<Field, BLOCK_CONSTANT_DATA_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.last_archive.serialize());
        fields.extend_from_array(self.last_l1_to_l2.serialize());
        fields.push(self.vk_tree_root);
        fields.push(self.protocol_contract_tree_root);
        fields.extend_from_array(self.global_variables.serialize());

        assert_eq(fields.len(), BLOCK_CONSTANT_DATA_LENGTH);

        fields.storage()
    }
}

impl Deserialize<BLOCK_CONSTANT_DATA_LENGTH> for BlockConstantData {
    fn deserialize(fields: [Field; BLOCK_CONSTANT_DATA_LENGTH]) -> BlockConstantData {
        let mut reader = Reader::new(fields);
        let item = Self {
            last_archive: reader.read_struct(AppendOnlyTreeSnapshot::deserialize),
            last_l1_to_l2: reader.read_struct(AppendOnlyTreeSnapshot::deserialize),
            vk_tree_root: reader.read(),
            protocol_contract_tree_root: reader.read(),
            global_variables: reader.read_struct(GlobalVariables::deserialize),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_block_constant_data() {
    let item = BlockConstantData::empty();
    let serialized = item.serialize();
    let deserialized = BlockConstantData::deserialize(serialized);
    assert(item.eq(deserialized));
}
