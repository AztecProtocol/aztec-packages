use crate::{
    abis::{
        base_or_merge_rollup_public_inputs::{BASE_ROLLUP_TYPE, BaseOrMergeRollupPublicInputs},
        constant_rollup_data::ConstantRollupData,
    },
    base::{
        components::{avm_proof_data::AvmProofData, public_tube_data::PublicTubeData},
        state_diff_hints::StateDiffHints,
    },
    components::{compute_kernel_out_hash, compute_tx_effects_hash},
};
use dep::types::{
    abis::{
        accumulated_data::CombinedAccumulatedData,
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        combined_constant_data::CombinedConstantData,
        kernel_circuit_public_inputs::KernelCircuitPublicInputs,
        log_hash::{LogHash, ScopedLogHash},
        nullifier_leaf_preimage::NullifierLeafPreimage,
        public_data_write::PublicDataWrite,
    },
    address::AztecAddress,
    constants::{
        ARCHIVE_HEIGHT, FEE_JUICE_ADDRESS, MAX_NOTE_HASHES_PER_TX,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NOTE_HASH_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PRIVATE_KERNEL_EMPTY_INDEX, PUBLIC_DATA_SUBTREE_HEIGHT,
        PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, PUBLIC_DATA_TREE_HEIGHT,
    },
    data::{
        hash::{compute_public_data_tree_index, compute_public_data_tree_value},
        public_data_hint::PublicDataHint,
        PublicDataTreeLeaf,
        PublicDataTreeLeafPreimage,
    },
    hash::silo_l2_to_l1_message,
    merkle_tree::{
        append_only_tree, assert_check_membership, calculate_empty_tree_root,
        calculate_subtree_root, indexed_tree, MembershipWitness,
    },
    messaging::l2_to_l1_message::ScopedL2ToL1Message,
    partial_state_reference::PartialStateReference,
    storage::map::derive_storage_slot_in_map,
    traits::is_empty,
    utils::{
        arrays::{array_merge, find_index_hint},
        field::{full_field_greater_than, full_field_less_than},
    },
};

pub struct PublicBaseRollupInputs {
    tube_data: PublicTubeData,
    avm_proof_data: AvmProofData,

    start: PartialStateReference,

    state_diff_hints: StateDiffHints,
    fee_payer_fee_juice_balance_read_hint: PublicDataHint,

    sorted_public_data_writes: [PublicDataTreeLeaf; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    sorted_public_data_writes_indexes: [u32; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_preimages: [PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_witnesses: [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    archive_root_membership_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    constants: ConstantRollupData,
}

impl PublicBaseRollupInputs {
    fn generate_kernel_circuit_public_inputs(self) -> KernelCircuitPublicInputs {
        let from_private = self.tube_data.public_inputs;
        let from_public = self.avm_proof_data.public_inputs;
        let reverted = from_public.reverted;

        let note_encrypted_logs_hashes = if reverted {
            from_private.non_revertible_accumulated_data.note_encrypted_logs_hashes
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.note_encrypted_logs_hashes,
                from_private.revertible_accumulated_data.note_encrypted_logs_hashes,
            )
        };
        let encrypted_logs_hashes = if reverted {
            from_private.non_revertible_accumulated_data.encrypted_logs_hashes
        } else {
            array_merge(
                from_private.non_revertible_accumulated_data.encrypted_logs_hashes,
                from_private.revertible_accumulated_data.encrypted_logs_hashes,
            )
        };
        let note_encrypted_log_preimages_length =
            note_encrypted_logs_hashes.fold(0, |len, l: LogHash| len + l.length);
        let encrypted_log_preimages_length =
            encrypted_logs_hashes.fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
        let unencrypted_log_preimages_length = from_public
            .accumulated_data
            .unencrypted_logs_hashes
            .fold(0, |len, l: ScopedLogHash| len + l.log_hash.length);
        let end = CombinedAccumulatedData {
            note_hashes: from_public.accumulated_data.note_hashes,
            nullifiers: from_public.accumulated_data.nullifiers,
            l2_to_l1_msgs: from_public.accumulated_data.l2_to_l1_msgs,
            note_encrypted_logs_hashes,
            encrypted_logs_hashes,
            unencrypted_logs_hashes: from_public.accumulated_data.unencrypted_logs_hashes,
            note_encrypted_log_preimages_length,
            encrypted_log_preimages_length,
            unencrypted_log_preimages_length,
            public_data_writes: from_public.accumulated_data.public_data_writes,
        };

        let constants =
            CombinedConstantData::combine(from_private.constants, from_public.global_variables);

        let start_state = PartialStateReference {
            note_hash_tree: from_public.start_tree_snapshots.note_hash_tree,
            nullifier_tree: from_public.start_tree_snapshots.nullifier_tree,
            public_data_tree: from_public.start_tree_snapshots.public_data_tree,
        };

        let revert_code = if from_public.reverted { 1 } else { 0 };

        KernelCircuitPublicInputs {
            constants,
            rollup_validation_requests: from_private.rollup_validation_requests,
            end,
            start_state,
            revert_code,
            gas_used: from_public.end_gas_used,
            fee_payer: from_private.fee_payer,
        }
    }

    pub fn execute(self) -> BaseOrMergeRollupPublicInputs {
        if !dep::std::runtime::is_unconstrained() {
            self.tube_data.verify();
            // TODO(#7410)
            // self.tube_data.vk_data.validate_in_vk_tree([TUBE_VK_INDEX]);
        }

        // TODO(#8470)
        // if !dep::std::runtime::is_unconstrained() {
        //     self.avm_proof_data.verify();
        //     self.avm_proof_data.vk_data.validate_in_vk_tree([AVM_VK_INDEX]);
        // }
        // TODO: Validate tube_data.public_inputs vs avm_proof_data.public_inputs
        // TODO: Deprecate KernelData.
        // Temporary workaround to create KernelCircuitPublicInputs from PublicKernelCircuitPublicInputs and AvmCircuitPublicInputs
        // so that we don't have to modify base_rollup_inputs.
        let public_inputs = self.generate_kernel_circuit_public_inputs();

        // Verify the kernel chain_id and versions
        assert(
            public_inputs.constants.tx_context.chain_id == self.constants.global_variables.chain_id,
            "kernel chain_id does not match the rollup chain_id",
        );
        assert(
            public_inputs.constants.tx_context.version == self.constants.global_variables.version,
            "kernel version does not match the rollup version",
        );
        assert(
            public_inputs.constants.vk_tree_root == self.constants.vk_tree_root,
            "kernel vk_tree_root does not match the rollup vk_tree_root",
        );
        assert(
            public_inputs.constants.protocol_contract_tree_root
                == self.constants.protocol_contract_tree_root,
            "kernel protocol_contract_tree_root does not match the rollup protocol_contract_tree_root",
        );

        // Verify the kernel global variables if set, note these can be empty if this is a request coming directly from the private kernel tail.
        // TODO(@spalladino) How can we check that this is a request coming from the private kernel tail?
        assert(
            public_inputs.constants.global_variables.is_empty()
                | (public_inputs.constants.global_variables == self.constants.global_variables),
            "kernel global variables do not match the rollup global variables",
        );

        self.validate_kernel_start_state(public_inputs);

        let rollup_validation_requests = public_inputs.rollup_validation_requests;

        // Verify the max block number
        // TODO #5345: why is block_number a Field and not u32?
        if rollup_validation_requests.max_block_number.is_some() {
            assert(
                self.constants.global_variables.block_number as u32
                    <= rollup_validation_requests.max_block_number.unwrap_unchecked(),
                "kernel max_block_number is smaller than block number",
            );
        }

        let commitments_tree_subroot = self.calculate_commitments_subtree(public_inputs);

        let empty_commitments_subtree_root = calculate_empty_tree_root(NOTE_HASH_SUBTREE_HEIGHT);

        let end_note_hash_tree_snapshot = append_only_tree::insert_subtree_to_snapshot_tree(
            self.start.note_hash_tree,
            self.state_diff_hints.note_hash_subtree_sibling_path,
            empty_commitments_subtree_root,
            commitments_tree_subroot,
            NOTE_HASH_SUBTREE_HEIGHT as u8,
        );

        // Insert nullifiers:
        let end_nullifier_tree_snapshot =
            self.check_nullifier_tree_non_membership_and_insert_to_tree(public_inputs);

        // Inject protocol update requests for deducting tx_fee from fee_payer's balance
        let all_public_data_update_requests = self.calculate_all_public_data_update_requests(
            self.avm_proof_data.public_inputs.transaction_fee,
            public_inputs,
        );

        // Validate public data update requests and update public data tree
        let end_public_data_tree_snapshot =
            self.validate_and_process_public_state(all_public_data_update_requests);

        // Calculate the tx effects hash of the transaction
        let siloed_l2_to_l1_msgs = public_inputs.end.l2_to_l1_msgs.map(
            |message: ScopedL2ToL1Message| silo_l2_to_l1_message(
                message,
                public_inputs.constants.tx_context.version,
                public_inputs.constants.tx_context.chain_id,
            ),
        );
        let out_hash = compute_kernel_out_hash(siloed_l2_to_l1_msgs);
        let tx_effects_hash = compute_tx_effects_hash(
            public_inputs.end,
            public_inputs.revert_code,
            self.avm_proof_data.public_inputs.transaction_fee,
            all_public_data_update_requests,
            out_hash,
        );

        // Perform membership checks that the notes provided exist within the historical trees data
        self.perform_archive_membership_checks(public_inputs);

        BaseOrMergeRollupPublicInputs {
            rollup_type: BASE_ROLLUP_TYPE,
            num_txs: 1,
            constants: self.constants,
            start: self.start,
            end: PartialStateReference {
                note_hash_tree: end_note_hash_tree_snapshot,
                nullifier_tree: end_nullifier_tree_snapshot,
                public_data_tree: end_public_data_tree_snapshot,
            },
            txs_effects_hash: tx_effects_hash,
            out_hash,
            accumulated_fees: self.avm_proof_data.public_inputs.transaction_fee,
        }
    }

    // TODO(Kev): This should say calculate_commitments_subtree_root
    // Cpp code says calculate_commitments_subtree, so I'm leaving it as is for now
    fn calculate_commitments_subtree(self, public_inputs: KernelCircuitPublicInputs) -> Field {
        calculate_subtree_root(public_inputs.end.note_hashes)
    }

    fn check_nullifier_tree_non_membership_and_insert_to_tree(
        self,
        public_inputs: KernelCircuitPublicInputs,
    ) -> AppendOnlyTreeSnapshot {
        indexed_tree::batch_insert(
            self.start.nullifier_tree,
            public_inputs.end.nullifiers,
            self.state_diff_hints.sorted_nullifiers,
            self.state_diff_hints.sorted_nullifier_indexes,
            self.state_diff_hints.nullifier_subtree_sibling_path,
            self.state_diff_hints.nullifier_predecessor_preimages,
            self.state_diff_hints.nullifier_predecessor_membership_witnesses.map(
                |witness: MembershipWitness<NULLIFIER_TREE_HEIGHT>| {
                    MembershipWitness {
                        leaf_index: witness.leaf_index,
                        sibling_path: witness.sibling_path,
                    }
                },
            ),
            |low_leaf: NullifierLeafPreimage, nullifier: Field| {
                // Is valid low leaf
                let is_less_than_nullifier = full_field_less_than(low_leaf.nullifier, nullifier);
                let is_next_greater_than = full_field_less_than(nullifier, low_leaf.next_nullifier);

                (!low_leaf.is_empty())
                    & is_less_than_nullifier
                    & (
                        is_next_greater_than
                            | ((low_leaf.next_index == 0) & (low_leaf.next_nullifier == 0))
                    )
            },
            |low_leaf: NullifierLeafPreimage, nullifier: Field, nullifier_index: u32| {
                // Update low leaf
                NullifierLeafPreimage {
                    nullifier: low_leaf.nullifier,
                    next_nullifier: nullifier,
                    next_index: nullifier_index,
                }
            },
            |nullifier: Field, low_leaf: NullifierLeafPreimage| {
                // Build insertion leaf
                NullifierLeafPreimage {
                    nullifier: nullifier,
                    next_nullifier: low_leaf.next_nullifier,
                    next_index: low_leaf.next_index,
                }
            },
            [0; NULLIFIER_SUBTREE_HEIGHT],
            [0; NULLIFIER_TREE_HEIGHT],
        )
    }

    fn create_nullifier_subtree<let N: u32>(leaves: [NullifierLeafPreimage; N]) -> Field {
        calculate_subtree_root(leaves.map(|leaf: NullifierLeafPreimage| leaf.hash()))
    }

    fn validate_kernel_start_state(self, public_inputs: KernelCircuitPublicInputs) {
        let kernel_state = public_inputs.start_state;
        if !is_empty(kernel_state) {
            assert(
                kernel_state.note_hash_tree.eq(self.start.note_hash_tree),
                "Mismatch start state for note hash tree",
            );
            assert(
                kernel_state.nullifier_tree.eq(self.start.nullifier_tree),
                "Mismatch start state for nullifier tree",
            );
            assert(
                kernel_state.public_data_tree.eq(self.start.public_data_tree),
                "Mismatch start state for public data tree",
            );
        }
    }

    fn validate_and_process_public_state(
        self,
        all_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    ) -> AppendOnlyTreeSnapshot {
        let end_public_data_tree_snapshot = insert_public_data_update_requests(
            self.start.public_data_tree,
            all_update_requests.map(|w: PublicDataWrite| {
                PublicDataTreeLeaf { slot: w.leaf_slot, value: w.value }
            }),
            self.sorted_public_data_writes,
            self.sorted_public_data_writes_indexes,
            self.low_public_data_writes_preimages,
            self.low_public_data_writes_witnesses,
            self.state_diff_hints.public_data_sibling_path,
        );

        end_public_data_tree_snapshot
    }

    // Returns an array with all public data update requests for this tx. This includes all update requests
    // generated by app circuits, plus the protocol update requests injected by this circuit. The only protocol
    // update request we have at the time of this writing is deducting the tx_fee from the fee_payer balance.
    fn calculate_all_public_data_update_requests(
        self,
        tx_fee: Field,
        public_inputs: KernelCircuitPublicInputs,
    ) -> [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] {
        let mut all_update_requests: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX] =
            [PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX];
        for i in 0..MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            all_update_requests[i] = public_inputs.end.public_data_writes[i];
        }

        let (payment_update_request, payment_update_index) =
            self.build_or_patch_payment_update_request(tx_fee, public_inputs);
        all_update_requests[payment_update_index] = payment_update_request;

        all_update_requests
    }

    // Deducts the tx_fee from the FeeJuice balance of the fee_payer. If there is already a PublicDataUpdateRequest
    // in this tx for their balance (because they issued a 'claim' to increase their balance by bridging from L1),
    // update it by subtracting the tx_fee. Otherwise, build a new PublicDataUpdateRequest to subtract the tx_fee
    // from the balance of the fee_payer, using the fee_payer_fee_juice_balance_read_hint to read the current balance.
    // Returns the data update request that subtracts the tx_fee from the fee_payer's balance, and the index where it
    // should be inserted in the public data update requests array.
    fn build_or_patch_payment_update_request(
        self,
        tx_fee: Field,
        public_inputs: KernelCircuitPublicInputs,
    ) -> (PublicDataWrite, u32) {
        let fee_payer = public_inputs.fee_payer;

        // TODO(@spalladino) Eventually remove the is_zero condition as we should always charge fees to every tx
        if !fee_payer.is_zero() {
            let read_hint = self.fee_payer_fee_juice_balance_read_hint;
            let leaf_slot = compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer);
            let existing_update_index = unsafe {
                find_index_hint(
                    public_inputs.end.public_data_writes,
                    |w: PublicDataWrite| w.leaf_slot == leaf_slot,
                )
            };

            if existing_update_index != MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
                // Is there a balance update already in this tx? If so, update it and return its index.
                let existing_update = public_inputs.end.public_data_writes[existing_update_index];
                assert(
                    existing_update.leaf_slot == leaf_slot,
                    "Wrong leaf slot for Fee Juice balance update request",
                );
                assert(
                    !existing_update.value.lt(tx_fee),
                    "Not enough balance for fee payer after claim to pay for transaction",
                );

                let value = compute_public_data_tree_value(existing_update.value - tx_fee);
                let protocol_update_request = PublicDataWrite { leaf_slot, value };
                (protocol_update_request, existing_update_index as u32)
            } else {
                // Otherwise, build a new one to be inserted into the protocol update requests at the end of the array.
                read_hint.validate(self.start.public_data_tree.root);

                let balance = read_hint.value;
                assert(
                    read_hint.leaf_slot == leaf_slot,
                    "Wrong leaf slot for Fee Juice balance read hint",
                );
                assert(
                    !balance.lt(tx_fee),
                    "Not enough balance for fee payer to pay for transaction",
                );

                let value = compute_public_data_tree_value(balance - tx_fee);
                let protocol_update_request = PublicDataWrite { leaf_slot, value };
                (protocol_update_request, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
            }
        } else {
            // Nothing to do, just place an empty update request at the end of the array
            (PublicDataWrite::empty(), MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX)
        }
    }

    // Check that the block header used by each kernel is a member of the blocks tree --> since the block header
    // contains roots of all the trees this is sufficient to verify that the tree roots used by kernels are correct
    fn perform_archive_membership_checks(self, public_inputs: KernelCircuitPublicInputs) {
        // For each of the block header (their block hashes), we need to do an inclusion proof
        // against the blocks tree root from the beginning of a rollup provided in the rollup constants
        let archive_root = self.constants.last_archive.root;

        // Rebuild the block hash
        let header = public_inputs.constants.historical_header;
        let previous_block_hash = header.hash();

        let previous_block_hash_witness = self.archive_root_membership_witness;

        // Now check that the previous block hash is in the blocks tree from the beginning of the rollup
        assert_check_membership(
            previous_block_hash,
            previous_block_hash_witness.leaf_index,
            previous_block_hash_witness.sibling_path,
            archive_root,
        );
    }
}

fn insert_public_data_update_requests(
    prev_snapshot: AppendOnlyTreeSnapshot,
    public_data_writes: [PublicDataTreeLeaf; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    sorted_public_data_writes: [PublicDataTreeLeaf; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    sorted_public_data_writes_indexes: [u32; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_preimages: [PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_witnesses: [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    public_data_writes_subtree_sibling_path: [Field; PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH],
) -> AppendOnlyTreeSnapshot {
    indexed_tree::batch_insert(
        prev_snapshot,
        public_data_writes,
        sorted_public_data_writes,
        sorted_public_data_writes_indexes,
        public_data_writes_subtree_sibling_path,
        low_public_data_writes_preimages,
        low_public_data_writes_witnesses.map(
            |witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>| {
                MembershipWitness {
                    leaf_index: witness.leaf_index,
                    sibling_path: witness.sibling_path,
                }
            },
        ),
        |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf| {
            // Is valid low preimage
            let is_update = low_preimage.slot == write.slot;
            let is_low_empty = low_preimage.is_empty();

            let is_less_than_slot = full_field_less_than(low_preimage.slot, write.slot);
            let is_next_greater_than = full_field_less_than(write.slot, low_preimage.next_slot);
            let is_in_range = is_less_than_slot
                & (
                    is_next_greater_than
                        | ((low_preimage.next_index == 0) & (low_preimage.next_slot == 0))
                );

            (!is_low_empty) & (is_update | is_in_range)
        },
        |low_preimage: PublicDataTreeLeafPreimage, write: PublicDataTreeLeaf, write_index: u32| {
            // Update low leaf
            let is_update = low_preimage.slot == write.slot;
            if is_update {
                PublicDataTreeLeafPreimage {
                    slot: low_preimage.slot,
                    value: write.value,
                    next_slot: low_preimage.next_slot,
                    next_index: low_preimage.next_index,
                }
            } else {
                PublicDataTreeLeafPreimage {
                    slot: low_preimage.slot,
                    value: low_preimage.value,
                    next_slot: write.slot,
                    next_index: write_index,
                }
            }
        },
        |write: PublicDataTreeLeaf, low_preimage: PublicDataTreeLeafPreimage| {
            // Build insertion leaf
            let is_update = low_preimage.slot == write.slot;
            if is_update {
                PublicDataTreeLeafPreimage::empty()
            } else {
                PublicDataTreeLeafPreimage {
                    slot: write.slot,
                    value: write.value,
                    next_slot: low_preimage.next_slot,
                    next_index: low_preimage.next_index,
                }
            }
        },
        [0; PUBLIC_DATA_SUBTREE_HEIGHT],
        [0; PUBLIC_DATA_TREE_HEIGHT],
    )
}

fn compute_fee_payer_fee_juice_balance_leaf_slot(fee_payer: AztecAddress) -> Field {
    let balances_slot_in_fee_juice_contract = 1;
    let fee_payer_balance_slot_in_fee_juice_contract =
        derive_storage_slot_in_map(balances_slot_in_fee_juice_contract, fee_payer);
    compute_public_data_tree_index(
        FEE_JUICE_ADDRESS,
        fee_payer_balance_slot_in_fee_juice_contract,
    )
}
