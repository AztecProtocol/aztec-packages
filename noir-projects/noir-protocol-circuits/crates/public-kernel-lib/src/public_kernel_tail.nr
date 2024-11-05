use crate::{
    components::{
        previous_kernel_validator::PreviousKernelValidator,
        public_tail_output_composer::{OutputHints, PublicTailOutputComposer},
        public_tail_output_validator::PublicTailOutputValidator,
    },
    public_kernel_phase::PublicKernelPhase,
};
use dep::reset_kernel_lib::{
    NullifierNonExistentReadRequestHints,
    NullifierReadRequestHints,
    public_data_read_request_hints::{
        build_public_data_read_request_hints, PublicDataReadRequestHints,
    },
    PublicValidationRequestProcessor,
    TreeLeafReadRequestHint,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::KernelCircuitPublicInputs,
        public_kernel_data::PublicKernelData,
    },
    constants::{
        L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_PUBLIC_DATA_HINTS, MAX_PUBLIC_DATA_READS_PER_TX, NOTE_HASH_TREE_HEIGHT,
    },
    data::PublicDataLeafHint,
    partial_state_reference::PartialStateReference,
};

global ALLOWED_PREVIOUS_CIRCUITS = [];

pub struct PublicKernelTailCircuitPrivateInputs {
    previous_kernel: PublicKernelData,
    note_hash_read_request_hints: [TreeLeafReadRequestHint<NOTE_HASH_TREE_HEIGHT>; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    nullifier_read_request_hints: NullifierReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
    l1_to_l2_msg_read_request_hints: [TreeLeafReadRequestHint<L1_TO_L2_MSG_TREE_HEIGHT>; MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
    public_data_hints: [PublicDataLeafHint; MAX_PUBLIC_DATA_HINTS],
    start_state: PartialStateReference,
}

impl PublicKernelTailCircuitPrivateInputs {
    unconstrained fn generate_output_and_hints(
        self,
    ) -> (KernelCircuitPublicInputs, OutputHints<MAX_PUBLIC_DATA_HINTS>, PublicDataReadRequestHints<MAX_PUBLIC_DATA_READS_PER_TX>) {
        let (output, output_hints) = PublicTailOutputComposer::new(
            self.previous_kernel.public_inputs,
            self.start_state,
            self.public_data_hints,
        )
            .finish();

        let public_data_read_request_hints = build_public_data_read_request_hints(
            self.previous_kernel.public_inputs.validation_requests.public_data_reads,
            output_hints.public_data_writes,
            output_hints.public_data_leaves,
        );

        (output, output_hints, public_data_read_request_hints)
    }

    pub fn execute(self) -> KernelCircuitPublicInputs {
        let previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);
        previous_kernel_validator.validate_phase(PublicKernelPhase.TAIL);
        // previous_kernel_validator.validate_proof(ALLOWED_PREVIOUS_CIRCUITS);
        let (output, output_hints, public_data_read_request_hints) =
            unsafe { self.generate_output_and_hints() };

        PublicValidationRequestProcessor::new(
            self.previous_kernel.public_inputs,
            self.start_state,
            self.note_hash_read_request_hints,
            self.nullifier_read_request_hints,
            self.nullifier_non_existent_read_request_hints,
            self.l1_to_l2_msg_read_request_hints,
            output_hints.public_data_writes,
            output_hints.public_data_leaves,
            public_data_read_request_hints,
        )
            .validate();

        PublicTailOutputValidator::new(
            output,
            self.previous_kernel.public_inputs,
            self.start_state,
            output_hints,
            self.public_data_hints,
        )
            .validate();

        output
    }
}

mod tests {
    use crate::public_kernel_tail::PublicKernelTailCircuitPrivateInputs;
    use dep::reset_kernel_lib::{
        reset::read_request::{PendingReadHint, ReadRequestState, ReadRequestStatus},
        tests::{
            nullifier_non_existent_read_request_hints_builder::NullifierNonExistentReadRequestHintsBuilder,
            nullifier_read_request_hints_builder::NullifierReadRequestHintsBuilder,
        },
        TreeLeafReadRequestHint,
    };
    use dep::types::{
        abis::{
            kernel_circuit_public_inputs::KernelCircuitPublicInputs, nullifier::ScopedNullifier,
            nullifier_leaf_preimage::NullifierLeafPreimage,
            public_data_update_request::PublicDataUpdateRequest,
        },
        address::AztecAddress,
        constants::{
            L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
            MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
            MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_HINTS,
            MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
            NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT,
            NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_TREE_HEIGHT,
            PUBLIC_DATA_SUBTREE_HEIGHT, PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH,
            PUBLIC_DATA_TREE_HEIGHT,
        },
        data::{PublicDataLeafHint, PublicDataTreeLeafPreimage},
        hash::{compute_siloed_nullifier, silo_note_hash},
        merkle_tree::MembershipWitness,
        partial_state_reference::PartialStateReference,
        tests::{
            fixture_builder::FixtureBuilder,
            merkle_tree_utils::NonEmptyMerkleTree,
            utils::{assert_array_eq, pad_end, swap_items},
        },
        traits::is_empty,
        utils::arrays::{array_merge, find_index_hint},
    };

    fn build_note_hash_tree<let N: u32>(
        leaf_preimages: [Field; N],
    ) -> NonEmptyMerkleTree<MAX_NOTE_HASHES_PER_TX, NOTE_HASH_TREE_HEIGHT, NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_SUBTREE_HEIGHT> {
        NonEmptyMerkleTree::new(
            pad_end(leaf_preimages, 0),
            [0; NOTE_HASH_TREE_HEIGHT],
            [0; NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT],
            [0; NOTE_HASH_SUBTREE_HEIGHT],
        )
    }

    fn build_nullifier_tree() -> NonEmptyMerkleTree<MAX_NULLIFIERS_PER_TX, NULLIFIER_TREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_SUBTREE_HEIGHT> {
        let mut pre_existing_nullifiers = [NullifierLeafPreimage::empty(); MAX_NULLIFIERS_PER_TX];
        pre_existing_nullifiers[0] =
            NullifierLeafPreimage { nullifier: 0, next_nullifier: 100, next_index: 1 };
        pre_existing_nullifiers[1] =
            NullifierLeafPreimage { nullifier: 100, next_nullifier: 0, next_index: 0 };
        NonEmptyMerkleTree::new(
            pre_existing_nullifiers.map(|preimage: NullifierLeafPreimage| preimage.hash()),
            [0; NULLIFIER_TREE_HEIGHT],
            [0; NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT],
            [0; NULLIFIER_SUBTREE_HEIGHT],
        )
    }

    fn build_public_data_tree<let N: u32>(
        leaf_preimages: [PublicDataTreeLeafPreimage; N],
    ) -> NonEmptyMerkleTree<MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, PUBLIC_DATA_SUBTREE_HEIGHT> {
        NonEmptyMerkleTree::new(
            pad_end(
                leaf_preimages.map(|preimage: PublicDataTreeLeafPreimage| preimage.hash()),
                0,
            ),
            [0; PUBLIC_DATA_TREE_HEIGHT],
            [0; PUBLIC_DATA_TREE_HEIGHT - PUBLIC_DATA_SUBTREE_HEIGHT],
            [0; PUBLIC_DATA_SUBTREE_HEIGHT],
        )
    }

    struct PublicKernelTailCircuitPrivateInputsBuilder {
        previous_kernel: FixtureBuilder,
        previous_revertible: FixtureBuilder,
        note_hash_read_request_hints: BoundedVec<TreeLeafReadRequestHint<NOTE_HASH_TREE_HEIGHT>, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
        nullifier_read_request_hints_builder: NullifierReadRequestHintsBuilder<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
        nullifier_non_existent_read_request_hints_builder: NullifierNonExistentReadRequestHintsBuilder,
        l1_to_l2_msg_read_request_hints: BoundedVec<TreeLeafReadRequestHint<L1_TO_L2_MSG_TREE_HEIGHT>, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX>,
        note_hash_tree: NonEmptyMerkleTree<MAX_NOTE_HASHES_PER_TX, NOTE_HASH_TREE_HEIGHT, NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NOTE_HASH_SUBTREE_HEIGHT>,
        note_hash_leaf_preimages: [Field; 2],
        public_data_tree: NonEmptyMerkleTree<MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PUBLIC_DATA_TREE_HEIGHT, PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, PUBLIC_DATA_SUBTREE_HEIGHT>,
        public_data_leaf_preimages: [PublicDataTreeLeafPreimage; 6],
        start_state: PartialStateReference,
    }

    impl PublicKernelTailCircuitPrivateInputsBuilder {
        pub fn new() -> PublicKernelTailCircuitPrivateInputsBuilder {
            let previous_kernel = FixtureBuilder::new();
            let previous_revertible = FixtureBuilder::new();
            let nullifier_non_existent_read_request_hints_builder =
                NullifierNonExistentReadRequestHintsBuilder::new();

            PublicKernelTailCircuitPrivateInputsBuilder {
                previous_kernel,
                previous_revertible,
                note_hash_read_request_hints: BoundedVec::new(),
                nullifier_read_request_hints_builder: NullifierReadRequestHintsBuilder::new(),
                nullifier_non_existent_read_request_hints_builder,
                l1_to_l2_msg_read_request_hints: BoundedVec::new(),
                note_hash_tree: NonEmptyMerkleTree::empty(),
                note_hash_leaf_preimages: [598589, 714714],
                public_data_tree: NonEmptyMerkleTree::empty(),
                public_data_leaf_preimages: pad_end([], PublicDataTreeLeafPreimage::empty()),
                start_state: PartialStateReference::empty(),
            }
        }

        pub fn with_note_hash_tree(&mut self) -> Self {
            self.note_hash_tree = build_note_hash_tree(self.note_hash_leaf_preimages);
            self.start_state.note_hash_tree.root = self.note_hash_tree.get_root();
            self.previous_kernel.historical_header.state.partial.note_hash_tree.root = 11111;
            *self
        }

        pub fn with_nullifier_tree(&mut self) -> Self {
            let nullifier_tree = build_nullifier_tree();
            self.nullifier_non_existent_read_request_hints_builder.set_nullifier_tree(
                nullifier_tree,
            );
            self.start_state.nullifier_tree.root = nullifier_tree.get_root();
            self.previous_kernel.historical_header.state.partial.nullifier_tree.root = 22222;
            *self
        }

        pub fn with_public_data_tree(&mut self) -> Self {
            let public_data_leaf_preimages = [
                PublicDataTreeLeafPreimage { slot: 0, value: 0, next_slot: 1111, next_index: 3 },
                PublicDataTreeLeafPreimage {
                    slot: 2222,
                    value: 200,
                    next_slot: 3333,
                    next_index: 2,
                },
                PublicDataTreeLeafPreimage { slot: 3333, value: 300, next_slot: 0, next_index: 0 },
                PublicDataTreeLeafPreimage {
                    slot: 1111,
                    value: 100,
                    next_slot: 2222,
                    next_index: 1,
                },
            ];
            let public_data_tree = build_public_data_tree(public_data_leaf_preimages);
            self.public_data_leaf_preimages = pad_end(
                public_data_leaf_preimages,
                PublicDataTreeLeafPreimage::empty(),
            );
            self.public_data_tree = public_data_tree;
            self.start_state.public_data_tree.root = public_data_tree.get_root();
            *self
        }

        pub fn add_note_hash_read_request(&mut self, leaf_index: u32) {
            self.previous_kernel.add_note_hash_tree_leaf_read_requests(
                self.note_hash_leaf_preimages[leaf_index],
                leaf_index as Field,
            );
            let sibling_path = self.note_hash_tree.get_sibling_path(leaf_index);
            self.note_hash_read_request_hints.push(TreeLeafReadRequestHint { sibling_path });
        }

        pub fn add_nullifier(&mut self, unsiloed_nullifier: Field) {
            self.previous_kernel.add_siloed_nullifier(unsiloed_nullifier);
            self.sync_counters();
            self.set_nullifiers_for_non_existent_read_request_hints();
        }

        pub fn append_nullifiers_revertible(&mut self, num_nullifiers: u32) {
            self.previous_revertible.append_siloed_nullifiers(num_nullifiers);
            self.sync_counters();
            self.set_nullifiers_for_non_existent_read_request_hints();
        }

        pub fn append_nullifiers_non_revertible(&mut self, num_nullifiers: u32) {
            self.previous_kernel.append_siloed_nullifiers(num_nullifiers);
            self.sync_counters();
            self.set_nullifiers_for_non_existent_read_request_hints();
        }

        fn set_nullifiers_for_non_existent_read_request_hints(&mut self) {
            let nullifiers = array_merge(
                self.previous_kernel.nullifiers.storage,
                self.previous_revertible.nullifiers.storage,
            )
                .map(|n: ScopedNullifier| n.nullifier);
            self.nullifier_non_existent_read_request_hints_builder.set_nullifiers(nullifiers);
        }

        pub fn add_pending_revertible_nullifier_read_request(&mut self, nullifier_index: u32) {
            let read_request_index =
                self.previous_kernel.add_read_request_for_pending_nullifier(nullifier_index);
            self.sync_counters();
            let hint_index = self.nullifier_read_request_hints_builder.pending_read_hints.len();
            let pending_value_index = nullifier_index + self.previous_kernel.nullifiers.len();
            let hint = PendingReadHint { read_request_index, pending_value_index };
            self.nullifier_read_request_hints_builder.pending_read_hints.push(hint);
            self.nullifier_read_request_hints_builder.read_request_statuses[read_request_index] =
                ReadRequestStatus { state: ReadRequestState.PENDING, hint_index };
        }

        pub fn add_pending_non_revertible_nullifier_read_request(&mut self, nullifier_index: u32) {
            let read_request_index =
                self.previous_kernel.add_read_request_for_pending_nullifier(nullifier_index);
            self.sync_counters();
            let hint_index = self.nullifier_read_request_hints_builder.pending_read_hints.len();
            let hint = PendingReadHint { read_request_index, pending_value_index: nullifier_index };
            self.nullifier_read_request_hints_builder.pending_read_hints.push(hint);
            self.nullifier_read_request_hints_builder.read_request_statuses[read_request_index] =
                ReadRequestStatus { state: ReadRequestState.PENDING, hint_index };
        }

        pub fn read_non_existent_nullifier(&mut self, unsiloed_nullifier: Field) {
            self.previous_kernel.add_non_existent_read_request_for_nullifier(unsiloed_nullifier);
            self.sync_counters();
            let siloed_nullifier =
                compute_siloed_nullifier(self.previous_kernel.contract_address, unsiloed_nullifier);
            self.nullifier_non_existent_read_request_hints_builder.add_value_read(siloed_nullifier);
        }

        fn create_public_data_leaf_hint(&mut self, leaf_slot: Field) -> PublicDataLeafHint {
            let low_leaf_index = unsafe {
                find_index_hint(
                    self.public_data_leaf_preimages,
                    |p: PublicDataTreeLeafPreimage| {
                        !leaf_slot.lt(p.slot) & (p.next_slot.eq(0) | leaf_slot.lt(p.next_slot))
                    },
                )
            };

            let preimage = self.public_data_leaf_preimages[low_leaf_index];
            let membership_witness = MembershipWitness {
                leaf_index: low_leaf_index as Field,
                sibling_path: self.public_data_tree.get_sibling_path(low_leaf_index),
            };

            PublicDataLeafHint { preimage, membership_witness }
        }

        fn generate_public_data_leaf_hints(
            &mut self,
        ) -> [PublicDataLeafHint; MAX_PUBLIC_DATA_HINTS] {
            let mut public_data_hints = BoundedVec::new();
            let mut unique_slots: BoundedVec<Field, MAX_PUBLIC_DATA_HINTS> = BoundedVec::new();

            for i in 0..self.previous_kernel.public_data_reads.len() {
                let read = self.previous_kernel.public_data_reads.get(i);
                if !unique_slots.any(|s| s == read.leaf_slot) {
                    public_data_hints.push(self.create_public_data_leaf_hint(read.leaf_slot));
                    unique_slots.push(read.leaf_slot);
                }
            }

            for i in 0..self.previous_kernel.public_data_update_requests.len() {
                let write = self.previous_kernel.public_data_update_requests.get(i);
                if !unique_slots.any(|s| s == write.leaf_slot) {
                    public_data_hints.push(self.create_public_data_leaf_hint(write.leaf_slot));
                    unique_slots.push(write.leaf_slot);
                }
            }

            public_data_hints.storage
        }

        fn sync_counters(&mut self) {
            let counter_non_revertible = self.previous_kernel.counter;
            let counter_revertible = self.previous_revertible.counter;
            if counter_non_revertible > counter_revertible {
                self.previous_revertible.counter = counter_non_revertible;
            } else {
                self.previous_kernel.counter = counter_revertible;
            }
        }

        pub fn execute(&mut self) -> KernelCircuitPublicInputs {
            let mut previous_kernel = self.previous_kernel.to_public_kernel_data(false);
            previous_kernel.public_inputs.end =
                self.previous_revertible.to_public_accumulated_data();

            self.set_nullifiers_for_non_existent_read_request_hints();
            let public_data_hints = self.generate_public_data_leaf_hints();

            let nullifier_read_request_hints =
                unsafe { self.nullifier_read_request_hints_builder.to_hints() };

            let nullifier_non_existent_read_request_hints =
                unsafe { self.nullifier_non_existent_read_request_hints_builder.to_hints() };

            let kernel = PublicKernelTailCircuitPrivateInputs {
                previous_kernel,
                note_hash_read_request_hints: self.note_hash_read_request_hints.storage,
                nullifier_read_request_hints,
                nullifier_non_existent_read_request_hints,
                l1_to_l2_msg_read_request_hints: self.l1_to_l2_msg_read_request_hints.storage,
                public_data_hints,
                start_state: self.start_state,
            };

            kernel.execute()
        }

        pub fn succeeded(&mut self) {
            let _ = self.execute();
        }

        pub fn failed(&mut self) {
            let _ = self.execute();
        }
    }

    #[test]
    unconstrained fn public_kernel_circuit_tail_succeeds() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        builder.succeeded();
        // TODO: Check the values in public inputs.
    }

    #[test]
    unconstrained fn measuring_of_log_lengths() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        // Logs for the previous call stack.
        let prev_encrypted_logs_hash = 80;
        let prev_encrypted_log_preimages_length = 13;
        let prev_unencrypted_logs_hash = 956;
        let prev_unencrypted_log_preimages_length = 24;
        builder.previous_revertible.add_encrypted_log_hash(
            prev_encrypted_logs_hash,
            prev_encrypted_log_preimages_length,
        );
        builder.previous_revertible.add_unencrypted_log_hash(
            prev_unencrypted_logs_hash,
            prev_unencrypted_log_preimages_length,
        );
        // Logs for the current call stack.
        let unencrypted_logs_hash = 26;
        let unencrypted_log_preimages_length = 50;
        builder.previous_revertible.add_unencrypted_log_hash(
            unencrypted_logs_hash,
            unencrypted_log_preimages_length,
        );

        let public_inputs = builder.execute();

        assert_eq(
            public_inputs.end.encrypted_log_preimages_length,
            prev_encrypted_log_preimages_length,
        );
        assert_eq(
            public_inputs.end.unencrypted_log_preimages_length,
            unencrypted_log_preimages_length + prev_unencrypted_log_preimages_length,
        );

        assert_eq(
            public_inputs.end.unencrypted_logs_hashes,
            builder.previous_revertible.unencrypted_logs_hashes.storage,
        );
    }

    #[test]
    unconstrained fn verify_note_hash_read_requests_succeeds() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new().with_note_hash_tree();

        builder.add_note_hash_read_request(1);

        builder.succeeded();
    }

    #[test]
    unconstrained fn one_pending_nullifier_read_request() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();

        builder.append_nullifiers_revertible(3);
        builder.add_pending_revertible_nullifier_read_request(1);
        builder.succeeded();
    }

    #[test]
    unconstrained fn two_pending_nullifier_read_requests() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();

        builder.append_nullifiers_revertible(3);
        builder.add_pending_revertible_nullifier_read_request(1);
        builder.add_pending_revertible_nullifier_read_request(0);

        builder.succeeded();
    }

    #[test]
    unconstrained fn one_pending_nullifier_read_request_non_revertible() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();

        builder.append_nullifiers_non_revertible(3);
        builder.add_pending_non_revertible_nullifier_read_request(1);
        builder.succeeded();
    }

    #[test(should_fail_with = "Value of the nullifier does not match read request")]
    unconstrained fn pending_nullifier_read_request_wrong_hint_fails() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();

        builder.append_nullifiers_revertible(3);
        builder.add_pending_revertible_nullifier_read_request(1);
        let mut hint = builder.nullifier_read_request_hints_builder.pending_read_hints.pop();
        hint.pending_value_index -= 1;
        builder.nullifier_read_request_hints_builder.pending_read_hints.push(hint);

        builder.failed();
    }

    #[test(should_fail_with = "Read request counter must be greater than the counter of the nullifier")]
    unconstrained fn pending_nullifier_read_request_reads_before_value_fails() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();

        builder.append_nullifiers_revertible(3);
        builder.add_pending_revertible_nullifier_read_request(1);
        let nullifier_being_read = builder.previous_revertible.nullifiers.get(1);
        let mut read_request = builder.previous_kernel.nullifier_read_requests.pop();
        read_request.read_request.counter = nullifier_being_read.counter() - 1;
        builder.previous_kernel.nullifier_read_requests.push(read_request);

        builder.failed();
    }

    // TODO: Add tests for reading (non-existent) settled values.

    #[test]
    unconstrained fn nullifier_non_existent_read_request() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new().with_nullifier_tree();

        builder.add_nullifier(3);
        builder.add_nullifier(1);
        builder.add_nullifier(9);

        builder.read_non_existent_nullifier(8);

        builder.succeeded();
    }

    #[test(should_fail_with = "Value exists in pending set")]
    unconstrained fn nullifier_non_existent_read_request_failed_read_exist() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new().with_nullifier_tree();

        builder.add_nullifier(3);
        builder.add_nullifier(1);
        builder.add_nullifier(9);

        builder.read_non_existent_nullifier(1);

        builder.failed();
    }

    #[test]
    unconstrained fn public_data_reads_and_writes_succeeds() {
        let mut builder =
            PublicKernelTailCircuitPrivateInputsBuilder::new().with_public_data_tree();

        builder.previous_kernel.add_public_data_read_request(22, 0);

        builder.previous_kernel.add_public_data_update_request(11, 500);
        builder.previous_kernel.add_public_data_update_request(22, 700);

        builder.previous_kernel.add_public_data_read_request(22, 700);
        builder.previous_kernel.add_public_data_read_request(11, 500);
        builder.previous_kernel.add_public_data_read_request(3333, 300);

        // Override the previous value at leaf slot 22.
        builder.previous_kernel.add_public_data_update_request(22, 701);

        // Override the value of the leaf.
        builder.previous_kernel.add_public_data_update_request(3333, 301);

        // Read the new values.
        builder.previous_kernel.add_public_data_read_request(22, 701);
        builder.previous_kernel.add_public_data_read_request(3333, 301);

        let prev_writes = builder.previous_kernel.public_data_update_requests.storage;

        // Shuffle the items so that they are not sorted by counter.
        swap_items(
            &mut builder.previous_kernel.public_data_update_requests,
            0,
            3,
        );
        swap_items(
            &mut builder.previous_kernel.public_data_update_requests,
            1,
            3,
        );
        swap_items(&mut builder.previous_kernel.public_data_reads, 1, 4);
        swap_items(&mut builder.previous_kernel.public_data_reads, 0, 3);

        let public_inputs = builder.execute();
        assert_array_eq(
            public_inputs.end.public_data_update_requests,
            [
                PublicDataUpdateRequest {
                    leaf_slot: 3333,
                    new_value: 301,
                    counter: prev_writes[4].counter,
                },
                PublicDataUpdateRequest {
                    leaf_slot: 11,
                    new_value: 500,
                    counter: prev_writes[1].counter,
                },
                PublicDataUpdateRequest {
                    leaf_slot: 22,
                    new_value: 701,
                    counter: prev_writes[3].counter,
                },
            ],
        );
    }

    #[test(should_fail_with = "value in OverridablePublicDataTreeLeaf does not match read request")]
    unconstrained fn reading_uninitialized_public_data_non_zero_value_fails() {
        let mut builder =
            PublicKernelTailCircuitPrivateInputsBuilder::new().with_public_data_tree();

        builder.previous_kernel.add_public_data_read_request(1234, 1);

        builder.failed();
    }

    #[test]
    unconstrained fn propagate_fee_payer() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        let fee_payer = AztecAddress::from_field(123);
        builder.previous_kernel.set_fee_payer(fee_payer);
        let public_inputs = builder.execute();
        assert_eq(public_inputs.fee_payer, fee_payer);

        // Check that the fee payer is not set if is_fee_payer is false
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        assert_eq(is_empty(builder.previous_kernel.fee_payer), true);
        let public_inputs = builder.execute();
        assert_eq(public_inputs.fee_payer, AztecAddress::empty());
    }

    #[test]
    unconstrained fn combine_and_silo_accumulated_note_hashes() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        builder.previous_revertible.value_offset = 999;
        builder.previous_revertible.counter = 88;
        builder.previous_kernel.set_first_nullifier();

        builder.previous_kernel.append_note_hashes(3);
        // 1 of them is from private.
        builder.previous_kernel.note_hashes.storage[0].note_hash.counter = 0;
        let non_rev = builder.previous_kernel.note_hashes.storage;

        builder.previous_revertible.append_note_hashes(5);
        // 2 of them are from private:
        builder.previous_revertible.note_hashes.storage[0].note_hash.counter = 0;
        builder.previous_revertible.note_hashes.storage[1].note_hash.counter = 0;
        let rev = builder.previous_revertible.note_hashes.storage;
        // Swap the items so that they are not ordered by counters.
        swap_items(&mut builder.previous_revertible.note_hashes, 2, 3);

        let public_inputs = builder.execute();

        let tx_hash = builder.previous_kernel.nullifiers.storage[0].value();
        let expected = [
            // Note hashes from private are already siloed.
            non_rev[0].value(),
            rev[0].value(),
            rev[1].value(),
            silo_note_hash(non_rev[1], tx_hash, 3),
            silo_note_hash(non_rev[2], tx_hash, 4),
            silo_note_hash(rev[2], tx_hash, 5),
            silo_note_hash(rev[3], tx_hash, 6),
            silo_note_hash(rev[4], tx_hash, 7),
        ];
        assert_array_eq(public_inputs.end.note_hashes, expected);
    }

    #[test]
    unconstrained fn combine_accumulated_nullifiers() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        builder.previous_revertible.value_offset = 999;
        builder.previous_revertible.counter = 88;

        builder.previous_kernel.append_nullifiers(3);
        // 1 of them is from private:
        builder.previous_kernel.nullifiers.storage[0].nullifier.counter = 0;
        let non_rev = builder.previous_kernel.nullifiers.storage;

        builder.previous_revertible.append_nullifiers(5);
        // 2 of them are from private:
        builder.previous_revertible.nullifiers.storage[0].nullifier.counter = 0;
        builder.previous_revertible.nullifiers.storage[1].nullifier.counter = 0;
        let rev = builder.previous_revertible.nullifiers.storage;
        // Swap the items so that they are not ordered by counters.
        swap_items(&mut builder.previous_revertible.nullifiers, 2, 3);

        let public_inputs = builder.execute();

        let expected = [non_rev[0], rev[0], rev[1], non_rev[1], non_rev[2], rev[2], rev[3], rev[4]]
            .map(|n: ScopedNullifier| n.nullifier.value);
        assert_array_eq(public_inputs.end.nullifiers, expected);
    }
}
