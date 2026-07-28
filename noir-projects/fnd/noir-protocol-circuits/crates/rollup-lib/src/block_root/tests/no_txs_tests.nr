use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageBundle, L1ToL2MessageSponge},
    block_root::block_root_no_txs_rollup::{self, BlockRootNoTxsRollupPrivateInputs},
    tests::RollupFixtureBuilder,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_header::BlockHeader,
        checkpoint_constant_data::CheckpointConstantData, global_variables::GlobalVariables,
        partial_state_reference::PartialStateReference, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK},
    merkle_tree::root_from_sibling_path,
    traits::Hash,
};

global TEST_NUM_MSGS: u32 = 5;

// Builds the inputs for a transaction-less block. `is_first_block` selects the checkpoint position: the first block
// starts both sponges from their initial values, a later block inherits them from its predecessor.
struct TestBuilder {
    is_first_block: bool,
    previous_archive: AppendOnlyTreeSnapshot,
    previous_state: StateReference,
    constants: CheckpointConstantData,
    timestamp: u64,
    start_sponge_blob: SpongeBlob,
    start_msg_sponge: L1ToL2MessageSponge,
    l1_to_l2_messages: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
    num_msgs: u32,
    l1_to_l2_message_frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    // Retained for assertions.
    new_l1_to_l2: AppendOnlyTreeSnapshot,
    partial: PartialStateReference,
}

impl TestBuilder {
    pub fn new() -> Self {
        Self::new_at_position(false)
    }

    pub fn new_first() -> Self {
        Self::new_at_position(true)
    }

    fn new_at_position(is_first_block: bool) -> Self {
        let fixture_builder = RollupFixtureBuilder::new();
        let slot_number = fixture_builder.start_slot_number;
        let block_number = fixture_builder.start_block_number;

        let (previous_l1_to_l2, l1_to_l2_messages, l1_to_l2_message_frontier_hint, new_l1_to_l2) =
            fixture_builder.build_l1_to_l2_message_bundle(TEST_NUM_MSGS);

        let (previous_archive, new_archive_sibling_path) =
            fixture_builder.build_archive_tree_for_insertion(block_number);

        // Borrow a partial state from a tx rollup fixture; it is simply propagated to the start and end states.
        let partial = fixture_builder.get_tx_rollup_public_inputs(6).start_tree_snapshots;
        let previous_state = StateReference { l1_to_l2_message_tree: previous_l1_to_l2, partial };

        let start_sponge_blob = if is_first_block {
            SpongeBlob::init()
        } else {
            // A later block inherits a non-empty sponge blob from the previous block.
            fixture_builder.get_sponge_blob(block_number)
        };
        let start_msg_sponge = if is_first_block {
            L1ToL2MessageSponge::new()
        } else {
            fixture_builder.get_msg_sponge(slot_number)
        };

        Self {
            is_first_block,
            previous_archive,
            previous_state,
            constants: fixture_builder.get_checkpoint_constant_data(slot_number),
            timestamp: fixture_builder.get_global_variables(block_number).timestamp,
            start_sponge_blob,
            start_msg_sponge,
            l1_to_l2_messages,
            num_msgs: TEST_NUM_MSGS,
            l1_to_l2_message_frontier_hint,
            new_archive_sibling_path,
            new_l1_to_l2,
            partial,
        }
    }

    fn to_inputs(self) -> BlockRootNoTxsRollupPrivateInputs {
        BlockRootNoTxsRollupPrivateInputs {
            previous_archive: self.previous_archive,
            previous_state: self.previous_state,
            constants: self.constants,
            timestamp: self.timestamp,
            start_sponge_blob: self.start_sponge_blob,
            start_msg_sponge: self.start_msg_sponge,
            message_bundle: L1ToL2MessageBundle {
                messages: self.l1_to_l2_messages,
                num_msgs: self.num_msgs,
            },
            l1_to_l2_message_frontier_hint: self.l1_to_l2_message_frontier_hint,
            new_archive_sibling_path: self.new_archive_sibling_path,
        }
    }

    pub fn execute(self) -> BlockRollupPublicInputs {
        block_root_no_txs_rollup::execute(self.to_inputs())
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: BlockRollupPublicInputs) {
        assert_eq(pi.num_blocks(), 1);
        assert_eq(pi.constants, self.constants);

        // --- Sponge blobs: threaded from the provided start, with the block end data absorbed. ---
        assert_eq(pi.start_sponge_blob, self.start_sponge_blob);
        let mut expected_end_sponge_blob = self.start_sponge_blob;
        expected_end_sponge_blob.absorb_block_end_data(
            self.constants_as_global_variables(),
            pi.previous_archive,
            pi.end_state,
            0, // num_txs
            0, // total_mana_used
        );
        assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);

        // --- Message sponge: threaded from the provided start, absorbing this block's bundle. ---
        assert_eq(pi.start_msg_sponge, self.start_msg_sponge);
        let mut expected_end_msg_sponge = self.start_msg_sponge;
        expected_end_msg_sponge.absorb(self.l1_to_l2_messages, self.num_msgs);
        assert_eq(pi.end_msg_sponge, expected_end_msg_sponge);

        // --- Archive: the block header hash is inserted at the next available index. ---
        assert_eq(pi.previous_archive, self.previous_archive);
        let sponge_blob_hash = expected_end_sponge_blob.squeeze();
        let block_header = BlockHeader {
            last_archive: pi.previous_archive,
            state: pi.end_state,
            sponge_blob_hash,
            global_variables: self.constants_as_global_variables(),
            total_fees: pi.accumulated_fees,
            total_mana_used: pi.accumulated_mana_used,
        };
        let expected_archive_root = root_from_sibling_path(
            block_header.hash(),
            pi.previous_archive.next_available_leaf_index,
            self.new_archive_sibling_path,
        );
        assert_eq(pi.new_archive.root, expected_archive_root);
        assert_eq(
            pi.new_archive.next_available_leaf_index,
            pi.previous_archive.next_available_leaf_index + 1,
        );

        // --- State: partial unchanged (no tx effects), l1-to-l2 tree moves by the appended bundle. ---
        assert_eq(pi.start_state.partial, self.partial);
        assert_eq(pi.end_state.partial, self.partial);
        assert_eq(pi.start_state.l1_to_l2_message_tree, self.previous_state.l1_to_l2_message_tree);
        assert_eq(pi.end_state.l1_to_l2_message_tree, self.new_l1_to_l2);

        // --- Timestamp / no tx effects. ---
        assert_eq(pi.timestamp, self.timestamp);
        assert_eq(pi.out_hash, 0);
        assert_eq(pi.accumulated_fees, 0);
        assert_eq(pi.accumulated_mana_used, 0);
    }

    fn constants_as_global_variables(self) -> GlobalVariables {
        GlobalVariables {
            chain_id: self.constants.chain_id,
            version: self.constants.version,
            block_number: self.previous_archive.next_available_leaf_index as u32,
            slot_number: self.constants.slot_number,
            timestamp: self.timestamp,
            coinbase: self.constants.coinbase,
            fee_recipient: self.constants.fee_recipient,
            gas_fees: self.constants.gas_fees,
        }
    }
}

#[test]
fn no_txs_block_root_success() {
    let builder = TestBuilder::new();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn first_no_txs_block_root_success() {
    let builder = TestBuilder::new_first();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

// A fully empty block (no txs and no messages) is valid at any position in a checkpoint. The prover cost of such
// blocks is bounded by the checkpoint's block cap, not by requiring every block to carry work.
#[test]
fn no_txs_block_root_accepts_empty_bundle() {
    let mut builder = TestBuilder::new();

    builder.num_msgs = 0;
    builder.l1_to_l2_messages = [0; MAX_L1_TO_L2_MSGS_PER_BLOCK];
    builder.new_l1_to_l2 = builder.previous_state.l1_to_l2_message_tree;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // With no messages the l1-to-l2 tree and the message sponge are both untouched.
    assert_eq(pi.end_state.l1_to_l2_message_tree, pi.start_state.l1_to_l2_message_tree);
    assert_eq(pi.end_msg_sponge, pi.start_msg_sponge);
}
