use crate::{
    note_hash_read_request_reset::NoteHashReadRequestHints,
    nullifier_read_request_reset::NullifierReadRequestHints,
    reset::{
        key_validation_request::{
            get_unverified_key_validation_requests, KeyValidationHint,
            verify_reset_key_validation_requests,
        },
        read_request::{get_unverified_read_requests, verify_reset_read_requests},
    },
};
use dep::types::{
    abis::{
        note_hash::ScopedNoteHash, nullifier::ScopedNullifier,
        validation_requests::PrivateValidationRequests,
    },
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX},
};

pub struct PrivateValidationRequestProcessor<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32> {
    pub validation_requests: PrivateValidationRequests,

    // Note hash read requests.
    pub note_hash_read_request_hints: NoteHashReadRequestHints<NH_RR_PENDING, NH_RR_SETTLED>,
    // - Pending.
    pub pending_note_hashes: [ScopedNoteHash; MAX_NOTE_HASHES_PER_TX],
    pub pending_note_hash_read_amount: u32,
    // - Settled.
    pub note_hash_tree_root: Field,
    pub settled_note_hash_read_amount: u32,

    // Nullifier read requests.
    pub nullifier_read_request_hints: NullifierReadRequestHints<NLL_RR_PENDING, NLL_RR_SETTLED>,
    // - Pending.
    pub pending_nullifiers: [ScopedNullifier; MAX_NULLIFIERS_PER_TX],
    pub pending_nullifier_read_amount: u32,
    // - Settled.
    pub nullifier_tree_root: Field,
    pub settled_nullifier_read_amount: u32,

    // Key validation requests.
    pub key_validation_hints: [KeyValidationHint; KEY_VALIDATION_HINTS_LEN],
    pub key_validation_amount: u32,

    // Split counter.
    pub validation_requests_split_counter: u32,
}

impl<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32> PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN> {
    pub unconstrained fn compose(self) -> PrivateValidationRequests {
        let note_hash_read_requests = get_unverified_read_requests(
            self.validation_requests.note_hash_read_requests,
            self.note_hash_read_request_hints.read_request_statuses,
        );

        let nullifier_read_requests = get_unverified_read_requests(
            self.validation_requests.nullifier_read_requests,
            self.nullifier_read_request_hints.read_request_statuses,
        );

        let scoped_key_validation_requests_and_generators = get_unverified_key_validation_requests(
            self.validation_requests.scoped_key_validation_requests_and_generators,
            self.key_validation_amount,
        );

        PrivateValidationRequests {
            for_rollup: self.validation_requests.for_rollup,
            note_hash_read_requests,
            nullifier_read_requests,
            scoped_key_validation_requests_and_generators,
            split_counter: Option::some(self.validation_requests_split_counter),
        }
    }

    pub fn validate(self, output: PrivateValidationRequests) {
        assert_eq(
            output.for_rollup,
            self.validation_requests.for_rollup,
            "mismatch validation request for rollup",
        );

        // note_hash_read_requests
        verify_reset_read_requests(
            self.validation_requests.note_hash_read_requests,
            self.pending_note_hashes,
            self.note_hash_read_request_hints.read_request_statuses,
            self.note_hash_read_request_hints.pending_read_hints,
            self.pending_note_hash_read_amount,
            self.note_hash_read_request_hints.settled_read_hints,
            self.settled_note_hash_read_amount,
            self.note_hash_tree_root,
            output.note_hash_read_requests,
        );

        // nullifier_read_requests
        verify_reset_read_requests(
            self.validation_requests.nullifier_read_requests,
            self.pending_nullifiers,
            self.nullifier_read_request_hints.read_request_statuses,
            self.nullifier_read_request_hints.pending_read_hints,
            self.pending_nullifier_read_amount,
            self.nullifier_read_request_hints.settled_read_hints,
            self.settled_nullifier_read_amount,
            self.nullifier_tree_root,
            output.nullifier_read_requests,
        );

        // key_validation_requests
        verify_reset_key_validation_requests(
            self.validation_requests.scoped_key_validation_requests_and_generators,
            self.key_validation_hints,
            self.key_validation_amount,
            output.scoped_key_validation_requests_and_generators,
        );

        // split_counter
        assert_eq(
            output.split_counter.unwrap(),
            self.validation_requests_split_counter,
            "mismatch split counter",
        );
        if self.validation_requests.split_counter.is_some() {
            assert_eq(
                self.validation_requests.split_counter.unwrap_unchecked(),
                self.validation_requests_split_counter,
                "mismatch hinted split counter",
            );
        }
    }
}
