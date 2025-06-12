use crate::{
    constants::EPOCH_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

pub struct EpochConstantData {
    // TODO: Move chain_id and version to here.
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub prover_id: Field,
}

impl Eq for EpochConstantData {
    fn eq(self, other: EpochConstantData) -> bool {
        self.vk_tree_root.eq(other.vk_tree_root)
            & self.protocol_contract_tree_root.eq(other.protocol_contract_tree_root)
            & self.prover_id.eq(other.prover_id)
    }
}

impl Empty for EpochConstantData {
    fn empty() -> Self {
        EpochConstantData { vk_tree_root: 0, protocol_contract_tree_root: 0, prover_id: 0 }
    }
}

impl Serialize<EPOCH_CONSTANT_DATA_LENGTH> for EpochConstantData {
    fn serialize(self) -> [Field; EPOCH_CONSTANT_DATA_LENGTH] {
        let mut fields: BoundedVec<Field, EPOCH_CONSTANT_DATA_LENGTH> = BoundedVec::new();

        fields.push(self.vk_tree_root);
        fields.push(self.protocol_contract_tree_root);
        fields.push(self.prover_id);

        assert_eq(fields.len(), EPOCH_CONSTANT_DATA_LENGTH);

        fields.storage()
    }
}

impl Deserialize<EPOCH_CONSTANT_DATA_LENGTH> for EpochConstantData {
    fn deserialize(fields: [Field; EPOCH_CONSTANT_DATA_LENGTH]) -> EpochConstantData {
        let mut reader = Reader::new(fields);
        let item = Self {
            vk_tree_root: reader.read(),
            protocol_contract_tree_root: reader.read(),
            prover_id: reader.read(),
        };

        reader.finish();
        item
    }
}

#[test]
fn serialization_of_empty_epoch_constant_data() {
    let item = EpochConstantData::empty();
    let serialized = item.serialize();
    let deserialized = EpochConstantData::deserialize(serialized);
    assert(item.eq(deserialized));
}
