use crate::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables,
        state_reference::StateReference,
    },
    constants::{BLOCK_HEADER_LENGTH, DOM_SEP__BLOCK_HEADER_HASH, GENESIS_BLOCK_HEADER_HASH},
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Hash, Serialize},
};
use std::meta::derive;

// docs:start:block-header
#[derive(Deserialize, Eq, Serialize)]
pub struct BlockHeader {
    pub last_archive: AppendOnlyTreeSnapshot,
    pub state: StateReference,

    // The hash of the sponge blob for this block, which commits to the tx effects added in this block.
    // Note: it may also include tx effects from previous blocks within the same checkpoint.
    // When proving tx effects from this block only, we must refer to the `sponge_blob_hash` in the previous block
    // header to show that the effect was added after the previous block.
    // The previous block header can be validated using a membership proof of the last leaf in `last_archive`.
    pub sponge_blob_hash: Field,

    pub global_variables: GlobalVariables,
    pub total_fees: Field,
    pub total_mana_used: Field,
}
// docs:end:block-header

impl BlockHeader {
    pub fn chain_id(self) -> Field {
        self.global_variables.chain_id
    }

    pub fn version(self) -> Field {
        self.global_variables.version
    }

    pub fn block_number(self) -> u32 {
        self.global_variables.block_number
    }

    pub fn timestamp(self) -> u64 {
        self.global_variables.timestamp
    }
}

impl Empty for BlockHeader {
    fn empty() -> Self {
        Self {
            last_archive: AppendOnlyTreeSnapshot::empty(),
            state: StateReference::empty(),
            sponge_blob_hash: 0,
            global_variables: GlobalVariables::empty(),
            total_fees: 0,
            total_mana_used: 0,
        }
    }
}

impl Hash for BlockHeader {
    fn hash(self) -> Field {
        poseidon2_hash_with_separator(self.serialize(), DOM_SEP__BLOCK_HEADER_HASH)
    }
}

#[test]
fn serialization_of_empty() {
    let header = BlockHeader::empty();
    // We use the BLOCK_HEADER_LENGTH constant to ensure that there is a match
    // between the derived trait implementation and the constant.
    let serialized: [Field; BLOCK_HEADER_LENGTH] = header.serialize();
    let deserialized = BlockHeader::deserialize(serialized);
    assert(header.eq(deserialized));
}

#[test]
fn hash_of_genesis_block_header() {
    let mut header = BlockHeader::empty();
    // The following values are taken from world_state.test.cpp > WorldStateTest.GetInitialTreeInfoForAllTrees.
    header.state.l1_to_l2_message_tree.root =
        0x0fef6d80d31109ddb56d6b3f607cbc9c0af0bff3ea0d43e8f278983c64c11f7a;
    header.state.partial.note_hash_tree.root =
        0x2590f2aab19dd791700b4a43d3f52bb88ef2409a3731da8e848663559202e4c6;
    header.state.partial.nullifier_tree.root =
        0x18935581a8ed73d08ffd00386fba55ba6c89f3ab848a76b8fedfa9034cee0454;
    header.state.partial.nullifier_tree.next_available_leaf_index = 128;
    header.state.partial.public_data_tree.root =
        0x1bef38b621017d3c7416663d0cd81369424560710526a3fbaaec13e356b9d084;
    header.state.partial.public_data_tree.next_available_leaf_index = 128;

    let hash = header.hash();
    assert_eq(hash, GENESIS_BLOCK_HEADER_HASH);
}

#[test]
fn hash_of_empty_block_header_match_typescript() {
    let header = BlockHeader::empty();
    let hash = header.hash();

    // Value from block_header.test.ts "computes empty hash" test
    let test_data_empty_hash = 0x0bdc537052dea0f80db9698585dff9f32063b86b6d4934ac17c30c81e8e416d3;
    assert_eq(hash, test_data_empty_hash);
}
