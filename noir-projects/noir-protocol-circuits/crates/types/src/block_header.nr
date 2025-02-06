use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    constants::GENERATOR_INDEX__BLOCK_HASH,
    content_commitment::ContentCommitment,
    hash::poseidon2_hash_with_separator,
    state_reference::StateReference,
    traits::{Deserialize, Empty, Hash, Serialize},
};

// docs:start:block-header
#[derive(Deserialize, Eq, Serialize)]
pub struct BlockHeader {
    pub last_archive: AppendOnlyTreeSnapshot,
    pub content_commitment: ContentCommitment,
    pub state: StateReference,
    pub global_variables: GlobalVariables,
    pub total_fees: Field,
    pub total_mana_used: Field,
}
// docs:end:block-header

impl Empty for BlockHeader {
    fn empty() -> Self {
        Self {
            last_archive: AppendOnlyTreeSnapshot::zero(),
            content_commitment: ContentCommitment::empty(),
            state: StateReference::empty(),
            global_variables: GlobalVariables::empty(),
            total_fees: 0,
            total_mana_used: 0,
        }
    }
}

impl Hash for BlockHeader {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), GENERATOR_INDEX__BLOCK_HASH)
    }
}

mod test {
    use crate::{
        block_header::BlockHeader,
        constants::BLOCK_HEADER_LENGTH,
        traits::{Deserialize, Empty, Hash, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let header = BlockHeader::empty();
        // We use the BLOCK_HEADER_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; BLOCK_HEADER_LENGTH] = header.serialize();
        let deserialized = BlockHeader::deserialize(serialized);
        assert(header.eq(deserialized));
    }

    #[test]
    fn hash_smoke() {
        let header = BlockHeader::empty();
        let _hashed = header.hash();
    }

    #[test]
    fn empty_hash_is_zero() {
        let header = BlockHeader::empty();
        let hash = header.hash();

        // Value from header.test.ts "computes empty hash" test
        let test_data_empty_hash =
            0x28e48e620bc00817609b5fc765bc74864561f25a3c941b33e5ee05266b752839;
        assert_eq(hash, test_data_empty_hash);
    }

}
