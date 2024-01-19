use crate::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        global_variables::GlobalVariables,
    },
    constants::{
        GENERATOR_INDEX__BLOCK_HASH,
        HEADER_LENGTH,
        NUM_FIELDS_PER_SHA256,
    },
    hash::pedersen_hash,
    state_reference::StateReference,
};

struct Header {
    last_archive: AppendOnlyTreeSnapshot,
    body_hash: [Field; NUM_FIELDS_PER_SHA256],
    state: StateReference,
    global_variables: GlobalVariables,
}

impl Header {

    pub fn serialize(self) -> [Field; HEADER_LENGTH] {
        [
            self.note_hash_tree_root,
            self.nullifier_tree_root,
            self.contract_tree_root,
            self.l1_to_l2_message_tree_root,
            self.archive_root,
            self.public_data_tree_root,
            self.global_variables_hash
        ]
    }

    pub fn deserialize(deserialized: [Field; HEADER_LENGTH]) -> Self {
        Header {
            note_hash_tree_root: deserialized[0],
            nullifier_tree_root: deserialized[1],
            contract_tree_root: deserialized[2],
            l1_to_l2_message_tree_root: deserialized[3],
            archive_root: deserialized[4],
            public_data_tree_root: deserialized[5],
            global_variables_hash: deserialized[6],
        }
    }

    // TODO: Nuke this. This is not the desired block hash. Keeping it here for compatibility reasons.
    pub fn block_hash(self) -> Field {
        // TODO(#3442): Unify the ordering in `BlockHeader::serialize` function and the ordering
        // in the block hash preimage --> This requires changes in the circuits.
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/3595)
        pedersen_hash([
            self.global_variables.hash(),
            self.state.partial.note_hash_tree.root,
            self.state.partial.nullifier_tree.root,
            self.state.partial.contract_tree.root,
            self.state.l1_to_l2_message_tree.root,
            self.state.partial.public_data_tree.root,
        ], GENERATOR_INDEX__BLOCK_HASH)
    }
}
