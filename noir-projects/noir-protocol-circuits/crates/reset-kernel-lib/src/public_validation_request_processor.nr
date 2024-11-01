use crate::{
    nullifier_non_existent_read_request_reset::NullifierNonExistentReadRequestHints,
    nullifier_read_request_reset::NullifierReadRequestHints,
    public_data_read_request_hints::PublicDataReadRequestHints,
    reset::{
        mutable_data_read_request::reset_mutable_data_read_requests,
        non_existent_read_request::reset_non_existent_read_requests,
        read_request::verify_reset_read_requests,
        tree_leaf_read_request::{TreeLeafReadRequestHint, validate_tree_leaf_read_requests},
    },
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs, nullifier::Nullifier,
        public_data_write::OverridablePublicDataWrite, read_request::ScopedReadRequest,
        validation_requests::PublicValidationRequests,
    },
    constants::{
        L1_TO_L2_MSG_TREE_HEIGHT, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_READS_PER_TX, NOTE_HASH_TREE_HEIGHT,
    },
    data::OverridablePublicDataTreeLeaf,
    hash::compute_siloed_nullifier,
    partial_state_reference::PartialStateReference,
    traits::is_empty,
    utils::arrays::{
        array_to_bounded_vec, assert_combined_array, assert_sorted_array, combine_arrays,
    },
};

pub struct PublicValidationRequestProcessor<let NUN_PUBLIC_DATA_WRITES: u32, let NUM_PUBLIC_DATA_LEAVES: u32> {
    validation_requests: PublicValidationRequests,
    note_hash_read_request_hints: [TreeLeafReadRequestHint<NOTE_HASH_TREE_HEIGHT>; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    note_hash_tree_root: Field,
    pending_nullifiers: [Nullifier; MAX_NULLIFIERS_PER_TX],
    nullifier_read_request_hints: NullifierReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
    nullifier_tree_root: Field,
    l1_to_l2_msg_read_request_hints: [TreeLeafReadRequestHint<L1_TO_L2_MSG_TREE_HEIGHT>; MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
    l1_to_l2_msg_tree_root: Field,
    pending_public_data_writes: [OverridablePublicDataWrite; NUN_PUBLIC_DATA_WRITES],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
    public_data_read_request_hints: PublicDataReadRequestHints<MAX_PUBLIC_DATA_READS_PER_TX>,
}

impl<let NUN_PUBLIC_DATA_WRITES: u32, let NUM_PUBLIC_DATA_LEAVES: u32> PublicValidationRequestProcessor<NUN_PUBLIC_DATA_WRITES, NUM_PUBLIC_DATA_LEAVES> {
    pub fn new(
        public_inputs: PublicKernelCircuitPublicInputs,
        start_state: PartialStateReference,
        note_hash_read_request_hints: [TreeLeafReadRequestHint<NOTE_HASH_TREE_HEIGHT>; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
        nullifier_read_request_hints: NullifierReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
        nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
        l1_to_l2_msg_read_request_hints: [TreeLeafReadRequestHint<L1_TO_L2_MSG_TREE_HEIGHT>; MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX],
        pending_public_data_writes: [OverridablePublicDataWrite; NUN_PUBLIC_DATA_WRITES],
        public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
        public_data_read_request_hints: PublicDataReadRequestHints<MAX_PUBLIC_DATA_READS_PER_TX>,
    ) -> Self {
        let non_revertible_nullifiers = public_inputs.end_non_revertible.nullifiers;
        let revertible_nullifiers = public_inputs.end.nullifiers;
        let pending_nullifiers =
            unsafe { combine_arrays(non_revertible_nullifiers, revertible_nullifiers) };
        assert_combined_array(
            non_revertible_nullifiers,
            revertible_nullifiers,
            pending_nullifiers,
        );

        PublicValidationRequestProcessor {
            validation_requests: public_inputs.validation_requests,
            note_hash_read_request_hints,
            note_hash_tree_root: start_state.note_hash_tree.root,
            pending_nullifiers,
            nullifier_read_request_hints,
            nullifier_non_existent_read_request_hints,
            nullifier_tree_root: start_state.nullifier_tree.root,
            l1_to_l2_msg_read_request_hints,
            l1_to_l2_msg_tree_root: public_inputs
                .constants
                .historical_header
                .state
                .l1_to_l2_message_tree
                .root,
            pending_public_data_writes,
            public_data_leaves,
            public_data_read_request_hints,
        }
    }

    pub fn validate(self) {
        self.validate_note_hash_read_requests();
        self.validate_nullifier_read_requests();
        self.validate_nullifier_non_existent_read_requests();
        self.validate_l1_to_l2_msg_read_requests();
        self.validate_public_data_read_requests();
    }

    fn validate_note_hash_read_requests(self) {
        validate_tree_leaf_read_requests(
            self.validation_requests.note_hash_read_requests,
            self.note_hash_read_request_hints,
            self.note_hash_tree_root,
        );
    }

    fn validate_nullifier_read_requests(self) {
        let requests = self.validation_requests.nullifier_read_requests;
        let hints = self.nullifier_read_request_hints;
        let unverified_nullifier_read_requests =
            [ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX]; // All nullifier read requests must be verified.
        verify_reset_read_requests(
            requests,
            self.pending_nullifiers,
            hints.read_request_statuses,
            hints.pending_read_hints,
            hints.settled_read_hints,
            self.nullifier_tree_root,
            unverified_nullifier_read_requests,
        );
    }

    fn validate_nullifier_non_existent_read_requests(self) {
        // The values of the read requests here need to be siloed.
        // Notice that it's not the case for regular read requests, which can be run between two kernel iterations, and will to be verified against unsiloed pending values.
        let mut read_requests = self.validation_requests.nullifier_non_existent_read_requests;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                read_requests[i].read_request.value =
                    compute_siloed_nullifier(read_request.contract_address, read_request.value());
            }
        }

        let hints = self.nullifier_non_existent_read_request_hints;

        assert_sorted_array(
            self.pending_nullifiers,
            hints.sorted_pending_values,
            hints.sorted_pending_value_index_hints,
            |a: Nullifier, b: Nullifier| a.value.lt(b.value),
        );
        let sorted_pending_nullifiers = array_to_bounded_vec(hints.sorted_pending_values);

        reset_non_existent_read_requests(
            read_requests,
            hints.non_membership_hints,
            self.nullifier_tree_root,
            sorted_pending_nullifiers,
            hints.next_pending_value_indices,
        );
    }

    fn validate_l1_to_l2_msg_read_requests(self) {
        validate_tree_leaf_read_requests(
            self.validation_requests.l1_to_l2_msg_read_requests,
            self.l1_to_l2_msg_read_request_hints,
            self.l1_to_l2_msg_tree_root,
        );
    }

    fn validate_public_data_read_requests(self) {
        let hints = self.public_data_read_request_hints;

        reset_mutable_data_read_requests(
            self.validation_requests.public_data_reads,
            hints.read_request_statuses,
            self.pending_public_data_writes,
            self.public_data_leaves,
            hints.pending_read_hints,
            hints.leaf_data_read_hints,
        );
    }
}
