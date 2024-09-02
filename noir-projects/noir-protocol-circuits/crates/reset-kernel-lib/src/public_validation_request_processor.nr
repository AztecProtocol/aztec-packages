use crate::{
    reset::{
    non_existent_read_request::reset_non_existent_read_requests,
    mutable_data_read_request::reset_mutable_data_read_requests,
    read_request::verify_reset_read_requests
},
    nullifier_read_request_reset::NullifierReadRequestHints,
    nullifier_non_existent_read_request_reset::NullifierNonExistentReadRequestHints,
    public_data_read_request_hints::PublicDataReadRequestHints
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs, nullifier::Nullifier,
    public_data_write::OverridablePublicDataWrite, read_request::ScopedReadRequest,
    validation_requests::PublicValidationRequests
},
    constants::{MAX_NULLIFIERS_PER_TX, MAX_PUBLIC_DATA_READS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX},
    data::OverridablePublicDataTreeLeaf, hash::compute_siloed_nullifier, traits::is_empty,
    utils::arrays::{array_merge, array_to_bounded_vec, assert_sorted_array}
};

struct PublicValidationRequestProcessor<let NUN_PUBLIC_DATA_WRITES: u32, let NUM_PUBLIC_DATA_LEAVES: u32> {
    validation_requests: PublicValidationRequests,
    pending_nullifiers: [Nullifier; MAX_NULLIFIERS_PER_TX],
    nullifier_read_request_hints: NullifierReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
    nullifier_tree_root: Field,
    pending_public_data_writes: [OverridablePublicDataWrite; NUN_PUBLIC_DATA_WRITES],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
    public_data_read_request_hints: PublicDataReadRequestHints<MAX_PUBLIC_DATA_READS_PER_TX>,
}

impl<let NUN_PUBLIC_DATA_WRITES: u32, let NUM_PUBLIC_DATA_LEAVES: u32> PublicValidationRequestProcessor<NUN_PUBLIC_DATA_WRITES, NUM_PUBLIC_DATA_LEAVES> {
    pub fn new(
        public_inputs: PublicKernelCircuitPublicInputs,
        nullifier_read_request_hints: NullifierReadRequestHints<MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
        nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
        nullifier_tree_root: Field,
        pending_public_data_writes: [OverridablePublicDataWrite; NUN_PUBLIC_DATA_WRITES],
        public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_PUBLIC_DATA_LEAVES],
        public_data_read_request_hints: PublicDataReadRequestHints<MAX_PUBLIC_DATA_READS_PER_TX>
    ) -> Self {
        let validation_requests = public_inputs.validation_requests;

        let end_non_revertible = public_inputs.end_non_revertible;
        let end = public_inputs.end;

        let pending_nullifiers = array_merge(end_non_revertible.nullifiers, end.nullifiers);

        PublicValidationRequestProcessor {
            validation_requests,
            pending_nullifiers,
            nullifier_read_request_hints,
            nullifier_non_existent_read_request_hints,
            nullifier_tree_root,
            pending_public_data_writes,
            public_data_leaves,
            public_data_read_request_hints
        }
    }

    pub fn validate(self) {
        self.validate_nullifier_read_requests();
        self.validate_nullifier_non_existent_read_requests();
        self.validate_public_data_read_requests();
    }

    fn validate_nullifier_read_requests(self) {
        let requests = self.validation_requests.nullifier_read_requests;
        let hints = self.nullifier_read_request_hints;
        let unverified_nullifier_read_requests = [ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX]; // All nullifier read requests must be verified.
        verify_reset_read_requests(
            requests,
            self.pending_nullifiers,
            hints.read_request_statuses,
            hints.pending_read_hints,
            hints.settled_read_hints,
            self.nullifier_tree_root,
            unverified_nullifier_read_requests
        );
    }

    fn validate_nullifier_non_existent_read_requests(self) {
        // The values of the read requests here need to be siloed.
        // Notice that it's not the case for regular read requests, which can be run between two kernel iterations, and will to be verified against unsiloed pending values.
        let mut read_requests = self.validation_requests.nullifier_non_existent_read_requests;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                read_requests[i].read_request.value = compute_siloed_nullifier(read_request.contract_address, read_request.value());
            }
        }

        let hints = self.nullifier_non_existent_read_request_hints;

        assert_sorted_array(
            self.pending_nullifiers,
            hints.sorted_pending_values,
            hints.sorted_pending_value_index_hints,
            |a: Nullifier, b: Nullifier| a.value.lt(b.value)
        );
        let sorted_pending_nullifiers = array_to_bounded_vec(hints.sorted_pending_values);

        reset_non_existent_read_requests(
            read_requests,
            hints.non_membership_hints,
            self.nullifier_tree_root,
            sorted_pending_nullifiers,
            hints.next_pending_value_indices
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
            hints.leaf_data_read_hints
        );
    }
}
