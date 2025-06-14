use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    constants::{BLOCK_HEADER_LENGTH, GENERATOR_INDEX__BLOCK_HASH, GENESIS_BLOCK_HEADER_HASH},
    content_commitment::ContentCommitment,
    hash::poseidon2_hash_with_separator,
    state_reference::StateReference,
    traits::{Deserialize, Empty, Hash, Serialize},
    utils::arrays::subarray,
};

// docs:start:block-header
pub struct BlockHeader {
    pub last_archive: AppendOnlyTreeSnapshot,
    pub content_commitment: ContentCommitment,
    pub state: StateReference,
    pub global_variables: GlobalVariables,
    pub total_fees: Field,
    pub total_mana_used: Field,
}
// docs:end:block-header

impl Eq for BlockHeader {
    fn eq(self, other: Self) -> bool {
        self.last_archive.eq(other.last_archive)
            & self.content_commitment.eq(other.content_commitment)
            & self.state.eq(other.state)
            & self.global_variables.eq(other.global_variables)
            & self.total_fees.eq(other.total_fees)
            & self.total_mana_used.eq(other.total_mana_used)
    }
}

impl Serialize<BLOCK_HEADER_LENGTH> for BlockHeader {
    fn serialize(self) -> [Field; BLOCK_HEADER_LENGTH] {
        let mut fields: BoundedVec<Field, BLOCK_HEADER_LENGTH> = BoundedVec::new();

        fields.extend_from_array(self.last_archive.serialize());
        fields.extend_from_array(self.content_commitment.serialize());
        fields.extend_from_array(self.state.serialize());
        fields.extend_from_array(self.global_variables.serialize());
        fields.push(self.total_fees);
        fields.push(self.total_mana_used);
        fields.storage()
    }
}

impl Deserialize<BLOCK_HEADER_LENGTH> for BlockHeader {
    fn deserialize(serialized: [Field; BLOCK_HEADER_LENGTH]) -> Self {
        let mut offset = 0;

        let last_archive_fields = subarray(serialized, offset);
        offset = offset + last_archive_fields.len();

        let content_commitment_fields = subarray(serialized, offset);
        offset = offset + content_commitment_fields.len();

        let state_fields = subarray(serialized, offset);
        offset = offset + state_fields.len();

        let global_variables_fields = subarray(serialized, offset);
        offset = offset + global_variables_fields.len();

        let total_fees = serialized[offset];
        offset = offset + 1;

        let total_mana_used = serialized[offset];

        BlockHeader {
            last_archive: AppendOnlyTreeSnapshot::deserialize(last_archive_fields),
            content_commitment: ContentCommitment::deserialize(content_commitment_fields),
            state: StateReference::deserialize(state_fields),
            global_variables: GlobalVariables::deserialize(global_variables_fields),
            total_fees,
            total_mana_used,
        }
    }
}

impl Empty for BlockHeader {
    fn empty() -> Self {
        Self {
            last_archive: AppendOnlyTreeSnapshot::empty(),
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

#[test]
fn serialization_of_empty() {
    let header = BlockHeader::empty();
    let serialized = header.serialize();
    let deserialized = BlockHeader::deserialize(serialized);
    assert(header.eq(deserialized));
}

#[test]
fn hash_of_genesis_block_header() {
    let mut header = BlockHeader::empty();
    // The following values are taken from world_state.test.cpp > WorldStateTest.GetInitialTreeInfoForAllTrees.
    header.state.l1_to_l2_message_tree.root =
        0x2e33ee2008411c04b99c24b313513d097a0d21a5040b6193d1f978b8226892d6;
    header.state.partial.note_hash_tree.root =
        0x1fd848aa69e1633722fe249a5b7f53b094f1c9cef9f5c694b073fd1cc5850dfb;
    header.state.partial.nullifier_tree.root =
        0x0c499b373a1f0fe1b510a63563546d2d39e206895056a5af0143c5f30d639073;
    header.state.partial.nullifier_tree.next_available_leaf_index = 128;
    header.state.partial.public_data_tree.root =
        0x23c08a6b1297210c5e24c76b9a936250a1ce2721576c26ea797c7ec35f9e46a9;
    header.state.partial.public_data_tree.next_available_leaf_index = 128;

    let hash = header.hash();
    assert_eq(hash, GENESIS_BLOCK_HEADER_HASH);
}

#[test]
fn hash_of_empty_block_header_match_typescript() {
    let header = BlockHeader::empty();
    let hash = header.hash();

    // Value from header.test.ts "computes empty hash" test
    let test_data_empty_hash = 0x1c97ed6fbc35f8b400d31bd38ce5cc938921e0cf2e20159d316f8c7011f9f42c;
    assert_eq(hash, test_data_empty_hash);
}
