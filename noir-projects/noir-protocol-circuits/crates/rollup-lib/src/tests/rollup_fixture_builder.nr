use crate::abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs, TxRollupPublicInputs};
use bignum::BigNum;
use blob::abis::{BatchingBlobCommitment, BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges};
use parity_lib::ParityPublicInputs;
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_constant_data::BlockConstantData,
        block_header::BlockHeader, checkpoint_constant_data::CheckpointConstantData,
        epoch_constant_data::EpochConstantData, fee_recipient::FeeRecipient, gas::Gas,
        gas_fees::GasFees, gas_settings::GasSettings, global_variables::GlobalVariables,
        partial_state_reference::PartialStateReference, sponge_blob::SpongeBlob,
        state_reference::StateReference, transaction::tx_context::TxContext,
        tree_snapshots::TreeSnapshots, tx_constant_data::TxConstantData,
    },
    address::{AztecAddress, EthAddress},
    constants::{
        ARCHIVE_HEIGHT, AZTEC_MAX_EPOCH_DURATION, BLOBS_PER_BLOCK, L1_TO_L2_MSG_SUBTREE_HEIGHT,
        L1_TO_L2_MSG_TREE_HEIGHT,
    },
    hash::poseidon2_hash,
    merkle_tree::calculate_empty_tree_root,
    proof::proof_data::ProofData,
    tests::{
        fixtures::{proof_data::make_proof_data, vk_tree::vk_tree_root},
        merkle_tree_utils::SingleSubtreeMerkleTree,
        utils::make_fixture,
    },
    traits::{Deserialize, Empty, Hash},
};

pub struct RollupFixtureBuilder {
    // Epoch constants.
    pub chain_id: Field,
    pub version: Field,
    pub vk_tree_root: Field,
    pub protocol_contracts_hash: Field,
    pub prover_id: Field,

    // Used to identify the first block, which will have an empty start_sponge_blob, and non-empty in_hash.
    pub start_block_number: u32,

    // Used to identify the first checkpoint, which will have an empty start_blob_accumulator.
    pub start_slot_number: Field,

    // Used to generate the consistent and correct final_blob_challenges for all rollups.
    pub end_slot_number: Field,
}

impl RollupFixtureBuilder {
    pub fn new() -> Self {
        RollupFixtureBuilder {
            chain_id: 1,
            version: 2,
            vk_tree_root,
            protocol_contracts_hash: 98765,
            prover_id: 76543,
            start_block_number: 11,
            start_slot_number: 7,
            end_slot_number: 7,
        }
    }

    pub fn make_proof_data<T, let ProofLen: u32, let VkLen: u32>(
        public_inputs: T,
        vk_index: u32,
    ) -> ProofData<T, ProofLen, VkLen> {
        make_proof_data(public_inputs, vk_index)
    }

    pub fn build_archive_tree(
        self,
        block_number: u32,
    ) -> (AppendOnlyTreeSnapshot, [Field; ARCHIVE_HEIGHT]) {
        // Insert header hashes of up to 2 existing blocks.
        let block_header_hashes = if block_number % 2 == 0 {
            [self.get_block_header(block_number).hash(), 0]
        } else {
            [
                self.get_block_header(block_number - 1).hash(),
                self.get_block_header(block_number).hash(),
            ]
        };
        let insert_index = (block_number - block_number % 2) as Field;
        let tree = SingleSubtreeMerkleTree::<2, 1, ARCHIVE_HEIGHT>::new_at_index(
            block_header_hashes,
            insert_index,
        );

        let snapshot = AppendOnlyTreeSnapshot {
            root: tree.get_root(),
            next_available_leaf_index: (block_number + 1) as Field,
        };

        // Get the sibling path for the current block.
        let sibling_path = tree.get_sibling_path(block_number as Field);

        (snapshot, sibling_path)
    }

    pub fn build_archive_tree_for_insertion(
        self,
        block_number: u32,
    ) -> (AppendOnlyTreeSnapshot, [Field; ARCHIVE_HEIGHT]) {
        // Insert header hashes of up to 4 previous blocks.
        let insert_index = block_number - block_number % 4;
        let mut block_header_hashes = [0; 4];
        for i in insert_index..block_number {
            block_header_hashes[i % 4] = self.get_block_header(i).hash();
        }
        let tree = SingleSubtreeMerkleTree::<4, 2, ARCHIVE_HEIGHT>::new_at_index(
            block_header_hashes,
            insert_index as Field,
        );

        let previous_snapshot = AppendOnlyTreeSnapshot {
            root: tree.get_root(),
            next_available_leaf_index: block_number as Field,
        };

        // Get the sibling path for inserting the current block header hash.
        let sibling_path_for_insertion = tree.get_sibling_path(block_number as Field);

        (previous_snapshot, sibling_path_for_insertion)
    }

    pub fn build_l1_to_l2_message_subtree_for_insertion(
        self,
        slot_number: Field,
    ) -> (AppendOnlyTreeSnapshot, [Field; L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT], AppendOnlyTreeSnapshot) {
        // Create a subtree of size 4 filled with subtree roots before the current slot.
        let new_slot_index = self.get_l1_to_l2_message_next_available_leaf_index(slot_number - 1)
             as u32
            >> L1_TO_L2_MSG_SUBTREE_HEIGHT;
        let start_slot_index = new_slot_index - new_slot_index % 4;
        let mut subtree_roots = [0; 4];
        for i in start_slot_index..new_slot_index {
            subtree_roots[i % 4] =
                self.get_l1_to_l2_message_subtree_root(slot_number - 4 + i as Field);
        }
        let empty_subtree_root = calculate_empty_tree_root(L1_TO_L2_MSG_SUBTREE_HEIGHT);
        subtree_roots[new_slot_index % 4] = empty_subtree_root;

        let mut tree = SingleSubtreeMerkleTree::<4, 2, L1_TO_L2_MSG_TREE_HEIGHT - L1_TO_L2_MSG_SUBTREE_HEIGHT>::new_tree_roots_at_index::<L1_TO_L2_MSG_SUBTREE_HEIGHT>(
            subtree_roots,
            start_slot_index as Field,
        );
        let previous_snapshot = AppendOnlyTreeSnapshot {
            root: tree.get_root(),
            next_available_leaf_index: self.get_l1_to_l2_message_next_available_leaf_index(
                slot_number - 1,
            ),
        };

        // Get the sibling path for inserting the current l1-to-l2 messages.
        let sibling_path_for_insertion = tree.get_sibling_path(new_slot_index as Field);

        // Insert subtree of the current l1-to-l2 messages.
        tree.update_leaf(
            new_slot_index as Field,
            self.get_l1_to_l2_message_subtree_root(slot_number),
        );
        let new_snapshot = AppendOnlyTreeSnapshot {
            root: tree.get_root(),
            next_available_leaf_index: self.get_l1_to_l2_message_next_available_leaf_index(
                slot_number,
            ),
        };

        (previous_snapshot, sibling_path_for_insertion, new_snapshot)
    }

    pub fn get_epoch_constant_data(self) -> EpochConstantData {
        EpochConstantData {
            chain_id: self.chain_id,
            version: self.version,
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts_hash,
            prover_id: self.prover_id,
        }
    }

    pub fn get_checkpoint_constant_data(self, slot_number: Field) -> CheckpointConstantData {
        CheckpointConstantData {
            chain_id: self.chain_id,
            version: self.version,
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts_hash,
            prover_id: self.prover_id,
            slot_number,
            coinbase: self.get_coinbase(slot_number),
            fee_recipient: self.get_fee_recipient(slot_number),
            gas_fees: self.get_gas_fees(slot_number),
        }
    }

    pub fn get_global_variables(self, block_number: u32) -> GlobalVariables {
        let slot_number = self.start_slot_number;
        GlobalVariables {
            chain_id: self.chain_id,
            version: self.version,
            block_number,
            slot_number,
            timestamp: self.get_timestamp(block_number),
            coinbase: self.get_coinbase(slot_number),
            fee_recipient: self.get_fee_recipient(slot_number),
            gas_fees: self.get_gas_fees(slot_number),
        }
    }

    pub fn get_block_constant_data(self, block_number: u32) -> BlockConstantData {
        BlockConstantData {
            last_archive: self.get_archive(block_number - 1),
            l1_to_l2_tree_snapshot: self.get_l1_to_l2_message_tree_snapshot(self.start_slot_number),
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts_hash,
            prover_id: self.prover_id,
            global_variables: self.get_global_variables(block_number),
        }
    }

    pub fn get_block_header(self, block_number: u32) -> BlockHeader {
        BlockHeader {
            last_archive: self.get_archive(block_number - 1),
            state: self.get_state_reference(block_number),
            sponge_blob_hash: block_number as Field * 9439783,
            global_variables: self.get_global_variables(block_number),
            total_fees: self.get_fee(block_number),
            total_mana_used: self.get_mana_used(block_number),
        }
    }

    pub fn get_tx_constant_data(self) -> TxConstantData {
        let slot_number = self.start_slot_number;
        let block_number = self.start_block_number;

        let gas_settings = GasSettings {
            // Tx's gas limits are not relevant in rollup circuits.
            gas_limits: Gas::empty(),
            teardown_gas_limits: Gas::empty(),
            max_fees_per_gas: self.get_gas_fees(slot_number),
            max_priority_fees_per_gas: GasFees::empty(),
        };

        TxConstantData {
            anchor_block_header: self.get_block_header(block_number),
            tx_context: TxContext { chain_id: self.chain_id, version: self.version, gas_settings },
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts_hash,
        }
    }

    pub fn get_tx_rollup_public_inputs(self, tx_index: u16) -> TxRollupPublicInputs {
        self.get_merged_tx_rollup_public_inputs(tx_index, tx_index)
    }

    pub fn get_merged_tx_rollup_public_inputs(
        self,
        start_tx_index: u16,
        end_tx_index: u16,
    ) -> TxRollupPublicInputs {
        let block_number = self.start_block_number;

        let num_txs = 1 + end_tx_index - start_tx_index;

        TxRollupPublicInputs {
            num_txs,
            constants: self.get_block_constant_data(block_number),
            start_tree_snapshots: self.get_tx_state_tree_snapshots(start_tx_index as u32 - 1),
            end_tree_snapshots: self.get_tx_state_tree_snapshots(end_tx_index as u32),
            start_sponge_blob: self.get_sponge_blob(start_tx_index as u32 - 1),
            end_sponge_blob: self.get_sponge_blob(end_tx_index as u32),
            out_hash: self.get_out_hash(end_tx_index as u32),
            accumulated_fees: self.get_fee(end_tx_index as u32),
            accumulated_mana_used: self.get_mana_used(end_tx_index as u32),
        }
    }

    pub fn get_block_rollup_public_inputs(self, block_number: u32) -> BlockRollupPublicInputs {
        self.get_merged_block_rollup_public_inputs(block_number, block_number)
    }

    pub fn get_merged_block_rollup_public_inputs(
        self,
        start_block_number: u32,
        end_block_number: u32,
    ) -> BlockRollupPublicInputs {
        let slot_number = self.start_slot_number;

        let in_hash = if start_block_number == self.start_block_number {
            self.get_in_hash(slot_number)
        } else {
            0
        };

        BlockRollupPublicInputs {
            constants: self.get_checkpoint_constant_data(slot_number),
            previous_archive: self.get_archive(start_block_number - 1),
            new_archive: self.get_archive(end_block_number),
            start_state: self.get_state_reference(start_block_number - 1),
            end_state: self.get_state_reference(end_block_number),
            start_sponge_blob: self.get_sponge_blob(start_block_number - 1),
            end_sponge_blob: self.get_sponge_blob(end_block_number),
            start_timestamp: self.get_timestamp(start_block_number),
            end_timestamp: self.get_timestamp(end_block_number),
            in_hash,
            out_hash: self.get_out_hash(end_block_number),
            accumulated_fees: self.get_fee(end_block_number),
            accumulated_mana_used: self.get_mana_used(end_block_number),
        }
    }

    pub fn get_checkpoint_rollup_public_inputs(
        self,
        slot_number: Field,
    ) -> CheckpointRollupPublicInputs {
        self.get_merged_checkpoint_rollup_public_inputs(slot_number, slot_number)
    }

    pub fn get_merged_checkpoint_rollup_public_inputs(
        self,
        start_slot_number: Field,
        end_slot_number: Field,
    ) -> CheckpointRollupPublicInputs {
        let mut checkpoint_header_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        let mut fees = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];
        let num_checkpoints = (end_slot_number - start_slot_number) as u32 + 1;
        for i in 0..num_checkpoints {
            let slot_number = i as Field + start_slot_number;
            checkpoint_header_hashes[i] = self.get_checkpoint_header_hash(slot_number);
            fees[i] = self.get_fee_and_coinbase(slot_number);
        }

        CheckpointRollupPublicInputs {
            constants: self.get_epoch_constant_data(),
            // Archive is created with block number, but we only need the values to be consistent for consecutive
            // checkpoints validation, so we use the slot numbers here to generate the fixtures.
            previous_archive: self.get_archive(start_slot_number as u32 - 1),
            new_archive: self.get_archive(end_slot_number as u32),
            checkpoint_header_hashes,
            fees,
            start_blob_accumulator: self.get_blob_accumulator(start_slot_number - 1),
            end_blob_accumulator: self.get_blob_accumulator(end_slot_number),
            final_blob_challenges: self.get_final_blob_challenges(),
        }
    }

    pub fn get_parity_public_inputs(self, slot_number: Field) -> ParityPublicInputs {
        ParityPublicInputs {
            sha_root: slot_number * 85831493,
            converted_root: self.get_l1_to_l2_message_subtree_root(slot_number),
            vk_tree_root: self.vk_tree_root,
        }
    }

    pub fn get_sponge_blob(self, block_number: u32) -> SpongeBlob {
        let mut sponge: SpongeBlob = self.make_fixture(1, block_number, 661);
        sponge.sponge.cache_size = 0;
        sponge.sponge.squeeze_mode = false;
        sponge
    }

    pub fn get_blob_accumulator(self, slot_number: Field) -> BlobAccumulator {
        if slot_number == (self.start_slot_number - 1) {
            // The first checkpoint in an epoch should start with an empty blob accumulator.
            BlobAccumulator::empty()
        } else {
            self.make_fixture(slot_number, 0, 1)
        }
    }

    pub fn get_blob_commitments(self, slot_number: Field) -> [BLSPoint; BLOBS_PER_BLOCK] {
        let mut commitments: [BLSPoint; BLOBS_PER_BLOCK] = std::mem::zeroed();
        for i in 0..BLOBS_PER_BLOCK {
            let x: [u128; 4] = self.make_fixture(slot_number, i, 58);
            let y: [u128; 4] = self.make_fixture(slot_number, i, 49);
            commitments[i] = BatchingBlobCommitment::from_limbs(x, y).point
        }
        commitments
    }

    pub fn get_final_blob_challenges(self) -> FinalBlobBatchingChallenges {
        // Derived from the end block accumulator of the last checkpoint in an epoch, so that the validation in root rollup will pass.
        let end_block_accumulator = self.get_blob_accumulator(self.end_slot_number);
        let z = end_block_accumulator.z_acc;
        // Safety: This is only for testing.
        let gamma = unsafe { __from_field(poseidon2_hash([end_block_accumulator.gamma_acc, z])) };
        FinalBlobBatchingChallenges { z, gamma: BigNum::from_limbs(gamma) }
    }

    fn get_fee(_self: Self, tx_or_block_number: u32) -> Field {
        tx_or_block_number as Field * 36
    }

    fn get_mana_used(_self: Self, tx_or_block_number: u32) -> Field {
        tx_or_block_number as Field * 23
    }

    fn get_out_hash(_self: Self, tx_or_block_number: u32) -> Field {
        tx_or_block_number as Field * 60415
    }

    fn get_in_hash(_self: Self, slot_number: Field) -> Field {
        slot_number * 94297
    }

    fn get_timestamp(_self: Self, block_number: u32) -> u64 {
        block_number as u64 + 507124
    }

    fn get_fee_recipient(self, slot_number: Field) -> AztecAddress {
        self.make_fixture(slot_number, 1, 283)
    }

    fn get_coinbase(self, slot_number: Field) -> EthAddress {
        self.make_fixture(slot_number, 1, 471)
    }

    fn get_fee_and_coinbase(self, slot_number: Field) -> FeeRecipient {
        let recipient = self.get_coinbase(slot_number);
        let value = slot_number * 81;
        FeeRecipient { recipient, value }
    }

    fn get_gas_fees(self, slot_number: Field) -> GasFees {
        self.make_fixture(slot_number, 1, 848)
    }

    fn get_tx_state_tree_snapshots(self, tx_or_block_number: u32) -> PartialStateReference {
        self.get_state_reference(tx_or_block_number).partial
    }

    // To be deprecated.
    fn get_state_reference(self, tx_or_block_number: u32) -> StateReference {
        StateReference {
            l1_to_l2_message_tree: self.get_l1_to_l2_message_tree_snapshot(self.start_slot_number),
            partial: self.make_fixture(self.start_slot_number, tx_or_block_number, 252),
        }
    }

    pub fn get_tree_snapshots(self, tx_or_block_number: u32) -> TreeSnapshots {
        TreeSnapshots {
            l1_to_l2_message_tree: self.get_l1_to_l2_message_tree_snapshot(self.start_slot_number),
            note_hash_tree: self.make_fixture(self.start_slot_number, tx_or_block_number, 252),
            nullifier_tree: self.make_fixture(self.start_slot_number, tx_or_block_number, 4783),
            public_data_tree: self.make_fixture(self.start_slot_number, tx_or_block_number, 19342),
        }
    }

    fn get_l1_to_l2_message_subtree_root(_self: Self, slot_number: Field) -> Field {
        slot_number * 7639901
    }

    fn get_l1_to_l2_message_next_available_leaf_index(_self: Self, slot_number: Field) -> Field {
        (slot_number + 1) * (1 << L1_TO_L2_MSG_SUBTREE_HEIGHT) as Field
    }

    fn get_l1_to_l2_message_tree_snapshot(self, slot_number: Field) -> AppendOnlyTreeSnapshot {
        let next_available_leaf_index =
            self.get_l1_to_l2_message_next_available_leaf_index(slot_number);
        AppendOnlyTreeSnapshot { root: slot_number as Field * 247953, next_available_leaf_index }
    }

    fn get_archive(_self: Self, block_number: u32) -> AppendOnlyTreeSnapshot {
        AppendOnlyTreeSnapshot {
            root: block_number as Field * 30785,
            next_available_leaf_index: (block_number + 1) as Field,
        }
    }

    fn get_checkpoint_header_hash(_self: Self, slot_number: Field) -> Field {
        slot_number * 9246 + 57149
    }

    fn make_fixture<T>(_self: Self, slot_number: Field, block_or_tx_number: u32, seed: Field) -> T
    where
        T: Deserialize,
    {
        let value_offset = slot_number * (seed * 37) + block_or_tx_number as Field * (seed + 11);
        make_fixture(value_offset)
    }
}

global TWO_POW_120: u128 = 0x1000000000000000000000000000000;

// Copied from the noir-bignum library. For testing purposes only.
unconstrained fn __from_field<let N: u32>(field: Field) -> [u128; N] {
    let mut x = field;
    let x_first_u128 = (x as u128);
    let first: u128 = x_first_u128 % TWO_POW_120;
    // this becomes the same as a integer division because we're removing the remainder
    x = (x - (first as Field)) / (TWO_POW_120 as Field);
    let x_second_u128 = (x as u128);
    let second = x_second_u128 % TWO_POW_120;
    x = (x - (second as Field)) / (TWO_POW_120 as Field);
    let x_third_u128 = (x as u128);
    let third = x_third_u128 % TWO_POW_120;
    let mut result: [u128; N] = [0; N];
    if N > 2 {
        result[0] = first;
        result[1] = second;
        result[2] = third;
    }
    if N == 2 {
        result[0] = first;
        result[1] = second;
    }
    if N == 1 {
        result[0] = first;
    }
    result
}
