use crate::{
    abis::{BlockRollupPublicInputs, L1ToL2MessageSponge, TxRollupPublicInputs},
    tx_merge::merge_tx_rollups,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_header::BlockHeader,
        checkpoint_constant_data::CheckpointConstantData, global_variables::GlobalVariables,
        partial_state_reference::PartialStateReference, state_reference::StateReference,
    },
    blob_data::SpongeBlob,
    constants::{ARCHIVE_HEIGHT, L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK},
    merkle_tree::append_only_tree,
    traits::Hash,
};

pub struct BlockRollupPublicInputsComposer {
    // The following values are initialized from the previous rollups or block.
    constants: CheckpointConstantData,
    previous_archive: AppendOnlyTreeSnapshot,
    previous_l1_to_l2: AppendOnlyTreeSnapshot,
    start_tree_snapshots: PartialStateReference,
    end_tree_snapshots: PartialStateReference,
    start_sponge_blob: SpongeBlob,
    end_sponge_blob: SpongeBlob,
    timestamp: u64,
    out_hash: Field,
    accumulated_fees: Field,
    accumulated_mana_used: Field,
    num_txs: u16,
    // The followings are set by calling `with_message_bundle` explicitly.
    is_first_block: bool,
    start_msg_sponge: L1ToL2MessageSponge,
    end_msg_sponge: L1ToL2MessageSponge,
    new_l1_to_l2: AppendOnlyTreeSnapshot,
}

impl BlockRollupPublicInputsComposer {
    pub fn new_from_no_rollups(
        previous_archive: AppendOnlyTreeSnapshot,
        previous_state: StateReference,
        constants: CheckpointConstantData,
        timestamp: u64,
    ) -> Self {
        // The first block of a checkpoint starts from an empty sponge blob.
        Self::new_from_no_rollups_with_start_sponge_blob(
            previous_archive,
            previous_state,
            constants,
            timestamp,
            SpongeBlob::init(),
        )
    }

    /// Same as `new_from_no_rollups` but for a non-first block, which inherits a (non-empty) sponge blob from the
    /// previous block instead of starting from empty. The `start_sponge_blob` is threaded unchanged as the end sponge
    /// blob (before this block's end data is absorbed in `finish`), since a block with no txs adds no tx effects. It is
    /// pinned against the previous block's `end_sponge_blob` at the block merge or checkpoint root.
    pub fn new_from_no_rollups_with_start_sponge_blob(
        previous_archive: AppendOnlyTreeSnapshot,
        previous_state: StateReference,
        constants: CheckpointConstantData,
        timestamp: u64,
        start_sponge_blob: SpongeBlob,
    ) -> Self {
        Self {
            constants,
            previous_archive,
            previous_l1_to_l2: previous_state.l1_to_l2_message_tree,
            // The state remains the same since there are no tx effects in this block.
            start_tree_snapshots: previous_state.partial,
            end_tree_snapshots: previous_state.partial,
            start_sponge_blob,
            end_sponge_blob: start_sponge_blob,
            timestamp,
            // The followings are 0 since there are no tx effects in this block.
            out_hash: 0,
            accumulated_fees: 0,
            accumulated_mana_used: 0,
            num_txs: 0,
            // The followings are updated by calling `with_message_bundle` explicitly.
            is_first_block: false,
            start_msg_sponge: L1ToL2MessageSponge::new(),
            end_msg_sponge: L1ToL2MessageSponge::new(),
            new_l1_to_l2: previous_state.l1_to_l2_message_tree,
        }
    }

    pub fn new_from_single_rollup(rollup: TxRollupPublicInputs) -> Self {
        let global_variables = rollup.constants.global_variables;
        let constants = CheckpointConstantData {
            chain_id: global_variables.chain_id,
            version: global_variables.version,
            vk_tree_root: rollup.constants.vk_tree_root,
            protocol_contracts_hash: rollup.constants.protocol_contracts_hash,
            prover_id: rollup.constants.prover_id,
            slot_number: global_variables.slot_number,
            coinbase: global_variables.coinbase,
            fee_recipient: global_variables.fee_recipient,
            gas_fees: global_variables.gas_fees,
        };

        // This should never bite, because both private/public tx base rollups set num_txs to 1. Nevertheless, it's here.
        assert(rollup.num_txs != 0, "Must use new_from_no_rollups instead.");

        Self {
            constants,
            previous_archive: rollup.constants.last_archive,
            start_tree_snapshots: rollup.start_tree_snapshots,
            end_tree_snapshots: rollup.end_tree_snapshots,
            start_sponge_blob: rollup.start_sponge_blob,
            end_sponge_blob: rollup.end_sponge_blob,
            timestamp: global_variables.timestamp,
            out_hash: rollup.out_hash,
            accumulated_fees: rollup.accumulated_fees,
            accumulated_mana_used: rollup.accumulated_mana_used,
            num_txs: rollup.num_txs,
            // The followings are updated by calling `with_message_bundle` explicitly.
            previous_l1_to_l2: rollup.constants.l1_to_l2_tree_snapshot,
            is_first_block: false,
            start_msg_sponge: L1ToL2MessageSponge::new(),
            end_msg_sponge: L1ToL2MessageSponge::new(),
            new_l1_to_l2: rollup.constants.l1_to_l2_tree_snapshot,
        }
    }

    pub fn new_from_two_rollups(rollups: [TxRollupPublicInputs; 2]) -> Self {
        let merged_rollup = merge_tx_rollups(rollups[0], rollups[1]);
        Self::new_from_single_rollup(merged_rollup)
    }

    /// Appends this block's L1-to-L2 message bundle to the tree and absorbs the same leaves into the message sponge.
    ///
    /// `previous_l1_to_l2` is the tree snapshot this block builds on: for the first block it is the pre-insertion
    /// snapshot (hinted, and later checked against the previous checkpoint), for subsequent blocks it is the snapshot
    /// carried in the constants. `start_msg_sponge` is the sponge inherited from the previous block (empty for the
    /// first block). Only `leaves[0..num_msgs]` are inserted and absorbed; the padding lanes must be zero. The sponge
    /// absorbs exactly the leaves inserted into the tree, so the checkpoint root can recompute the same commitment.
    pub fn with_message_bundle(
        &mut self,
        is_first_block: bool,
        previous_l1_to_l2: AppendOnlyTreeSnapshot,
        start_msg_sponge: L1ToL2MessageSponge,
        leaves: [Field; MAX_L1_TO_L2_MSGS_PER_BLOCK],
        num_msgs: u32,
        frontier_hint: [Field; L1_TO_L2_MSG_TREE_HEIGHT],
    ) -> Self {
        self.is_first_block = is_first_block;
        self.previous_l1_to_l2 = previous_l1_to_l2;

        // Append the bundle to the l1-to-l2 message tree at its current (arbitrary) next-available index.
        self.new_l1_to_l2 = append_only_tree::append_leaves_to_snapshot::<L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSGS_PER_BLOCK>(
            previous_l1_to_l2,
            leaves,
            num_msgs,
            frontier_hint,
        );

        // Absorb the same leaves into the message sponge, threading it from the previous block.
        self.start_msg_sponge = start_msg_sponge;
        let mut end_msg_sponge = start_msg_sponge;
        end_msg_sponge.absorb(leaves, num_msgs);
        self.end_msg_sponge = end_msg_sponge;

        *self
    }

    /// The l1-to-l2 tree snapshot after appending this block's bundle. First-block variants check this against the
    /// snapshot in the tx constants (consumed by the AVM to read new messages).
    pub fn get_new_l1_to_l2(self) -> AppendOnlyTreeSnapshot {
        self.new_l1_to_l2
    }

    pub fn finish(
        self,
        new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
    ) -> BlockRollupPublicInputs {
        // Build the header of this block and then insert its hash to the archive tree.
        let (block_header, end_sponge_blob) = self.create_block_header_and_end_sponge_blob();
        let block_header_hash = block_header.hash();
        let new_archive = append_only_tree::append_leaf_to_snapshot::<ARCHIVE_HEIGHT>(
            self.previous_archive,
            new_archive_sibling_path,
            block_header_hash,
        );

        let start_state = StateReference {
            l1_to_l2_message_tree: self.previous_l1_to_l2,
            partial: self.start_tree_snapshots,
        };

        BlockRollupPublicInputs {
            constants: self.constants,
            previous_archive: self.previous_archive,
            new_archive,
            start_state,
            end_state: block_header.state,
            start_sponge_blob: self.start_sponge_blob,
            end_sponge_blob,
            timestamp: self.timestamp,
            block_headers_hash: block_header_hash,
            is_first_block: self.is_first_block,
            start_msg_sponge: self.start_msg_sponge,
            end_msg_sponge: self.end_msg_sponge,
            out_hash: self.out_hash,
            accumulated_fees: self.accumulated_fees,
            accumulated_mana_used: self.accumulated_mana_used,
        }
    }

    fn create_block_header_and_end_sponge_blob(self) -> (BlockHeader, SpongeBlob) {
        let last_archive = self.previous_archive;

        let state = StateReference {
            l1_to_l2_message_tree: self.new_l1_to_l2,
            partial: self.end_tree_snapshots,
        };

        // Block number equals the index at which the new block header hash is inserted into the archive tree.
        let block_number = self.previous_archive.next_available_leaf_index as u32;

        // TODO: this feels like "validation" that should therefore be done by the "Validator", rather than this "Composer".
        // TODO: consider doing this as part of the "empty" variant's validation. It doesn't seem to belong here?

        // Note: For non-empty blocks, a check is performed in `block_root_rollup_inputs_validator.nr` to ensure that
        // the leaf index (field) matches the block number (u32) in the tx constants, which implies that the leaf index does not
        // exceed u32. However, for empty blocks, without the check below, the block number would be truncated to a
        // smaller value (dropping the high bits) if the leaf index exceeded u32. This would allow the block to follow
        // a block with a much smaller block number, while `last_archive` would still contain the large index.
        // This mismatch would make it impossible to provide the correct preimage when proving against this block as an
        // anchor, since the block header hash cannot be constructed without knowing the full leaf index.
        // Note: An empty block with a mismatched `last_archive` leaf index could be rolled up if it is in the first
        // checkpoint of an epoch, since only the `last_archive.root` is output from the root rollup and checked on L1.
        self.previous_archive.next_available_leaf_index.assert_max_bit_size::<32>();
        std::static_assert(
            ARCHIVE_HEIGHT <= 32,
            "You need to update the max bit size on the line above",
        );

        let global_variables = GlobalVariables {
            chain_id: self.constants.chain_id,
            version: self.constants.version,
            block_number,
            slot_number: self.constants.slot_number,
            timestamp: self.timestamp,
            coinbase: self.constants.coinbase,
            fee_recipient: self.constants.fee_recipient,
            gas_fees: self.constants.gas_fees,
        };

        // Absorb data for this block into the end sponge blob.
        let mut block_end_sponge_blob = self.end_sponge_blob;

        // The l1-to-l2 message tree root is absorbed only for the first block of a checkpoint (the value is shared by
        // all blocks in the checkpoint). `is_first_block` is asserted true at the checkpoint root and false for every
        // non-first ("right") rollup in `validate_consecutive_block_rollups.nr`, so it can only be true for the first
        // block. This replaces the former `in_hash != 0` derivation.
        block_end_sponge_blob.absorb_block_end_data(
            global_variables,
            last_archive,
            state,
            self.num_txs,
            self.accumulated_mana_used,
            self.is_first_block,
        );

        // Duplicate the `block_end_sponge_blob` so that we can squeeze it.
        // This is because `squeeze` will mutate the sponge to be in squeeze mode to update the state. But we want to
        // propagate the un-squeezed sponge so that it can keep absorbing data in the next block.
        let mut duplicated_end_sponge_blob = block_end_sponge_blob;
        let sponge_blob_hash = duplicated_end_sponge_blob.squeeze();

        let block_header = BlockHeader {
            last_archive,
            state,
            sponge_blob_hash,
            global_variables,
            total_fees: self.accumulated_fees,
            total_mana_used: self.accumulated_mana_used,
        };

        (block_header, block_end_sponge_blob)
    }
}
