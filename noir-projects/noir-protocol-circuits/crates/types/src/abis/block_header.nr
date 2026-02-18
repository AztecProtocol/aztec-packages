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
        0x0ad385c733f09879d005b1c483468232813916924a93cb305f26f9772908efa5;
    header.state.partial.nullifier_tree.next_available_leaf_index = 128;
    header.state.partial.public_data_tree.root =
        0x0c38b50018e675c7b3d40d20f250c710d9c565a28ed5cd1fbe057ac9b5902192;
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
