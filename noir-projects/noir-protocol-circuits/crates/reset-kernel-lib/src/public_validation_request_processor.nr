use crate::{
    non_existent_read_request_reset::reset_non_existent_read_requests,
    nullifier_read_request_reset::NullifierReadRequestHints,
    nullifier_non_existent_read_request_reset::NullifierNonExistentReadRequestHints,
    read_request_reset::reset_read_requests
};
use dep::types::{
    abis::{
    kernel_circuit_public_inputs::PublicKernelCircuitPublicInputs,
    side_effect::SideEffectLinkedToNoteHash, validation_requests::ValidationRequests
},
    hash::silo_nullifier, traits::is_empty,
    utils::arrays::{array_merge, array_to_bounded_vec, assert_sorted_array}
};

struct PublicValidationRequestProcessor {
    public_inputs: PublicKernelCircuitPublicInputs,
    validation_requests: ValidationRequests,
    nullifier_read_request_hints: NullifierReadRequestHints,
    nullifier_non_existent_read_request_hints: NullifierNonExistentReadRequestHints,
    nullifier_tree_root: Field,
}

impl PublicValidationRequestProcessor {
    pub fn validate(self) {
        self.validate_nullifier_read_requests();
        self.validate_nullifier_non_existent_read_requests();
    }

    fn validate_nullifier_read_requests(self) {
        let end_non_revertible = self.public_inputs.end_non_revertible;
        let end = self.public_inputs.end;

        let requests = self.public_inputs.validation_requests.nullifier_read_requests;

        let pending_nullifiers = array_merge(end_non_revertible.new_nullifiers, end.new_nullifiers);

        let hints = self.nullifier_read_request_hints;

        let nullifier_tree_root = self.nullifier_tree_root;

        let unverified_nullifier_read_requests = reset_read_requests(
            requests,
            pending_nullifiers,
            hints.read_request_statuses,
            hints.pending_read_hints,
            hints.settled_read_hints,
            nullifier_tree_root
        );

        assert(
            unverified_nullifier_read_requests.len() == 0, "All nullifier read requests must be verified"
        );
    }

    fn validate_nullifier_non_existent_read_requests(self) {
        let end_non_revertible = self.public_inputs.end_non_revertible;
        let end = self.public_inputs.end;

        // The values of the read requests here need to be siloed.
        // Notice that it's not the case for regular read requests, which can be run between two kernel iterations, and will to be verified against unsiloed pending values.
        let mut read_requests = self.public_inputs.validation_requests.nullifier_non_existent_read_requests;
        for i in 0..read_requests.len() {
            let read_request = read_requests[i];
            if !is_empty(read_request) {
                read_requests[i].value = silo_nullifier(read_request.contract_address, read_request.value);
            }
        }

        let nullifier_tree_root = self.nullifier_tree_root;

        let hints = self.nullifier_non_existent_read_request_hints;

        let pending_nullifiers = array_merge(end_non_revertible.new_nullifiers, end.new_nullifiers);
        assert_sorted_array(
            pending_nullifiers,
            hints.sorted_pending_values,
            hints.sorted_pending_value_index_hints,
            |a: SideEffectLinkedToNoteHash, b: SideEffectLinkedToNoteHash| a.value.lt(b.value)
        );
        let sorted_pending_nullifiers = array_to_bounded_vec(hints.sorted_pending_values);

        reset_non_existent_read_requests(
            read_requests,
            hints.non_membership_hints,
            nullifier_tree_root,
            sorted_pending_nullifiers,
            hints.next_pending_value_indices
        );
    }
}
