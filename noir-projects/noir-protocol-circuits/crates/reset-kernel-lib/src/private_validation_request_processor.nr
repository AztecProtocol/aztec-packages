use crate::{
    note_hash_read_request_reset::NoteHashReadRequestHints,
    nullifier_read_request_reset::NullifierReadRequestHints, reset::read_request::reset_read_requests
};
use dep::types::{
    abis::{
    note_hash::ScopedNoteHash, nullifier::ScopedNullifier, validation_requests::ValidationRequests,
    read_request::ScopedReadRequest, key_validation_request::ScopedKeyValidationRequest
},
    constants::{
    MAX_NEW_NOTE_HASHES_PER_TX, MAX_NEW_NULLIFIERS_PER_TX, MAX_KEY_VALIDATION_REQUESTS_PER_TX,
    GENERATOR_INDEX__NSK_M, MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NULLIFIER_READ_REQUESTS_PER_TX
},
    grumpkin_private_key::GrumpkinPrivateKey, hash::poseidon2_hash, traits::is_empty,
    utils::arrays::filter_array_to_bounded_vec
};

struct PrivateValidationRequestProcessor {
    validation_requests: ValidationRequests,
    note_hash_read_request_hints: NoteHashReadRequestHints,
    pending_note_hashes: [ScopedNoteHash; MAX_NEW_NOTE_HASHES_PER_TX],
    note_hash_tree_root: Field,
    nullifier_read_request_hints: NullifierReadRequestHints,
    pending_nullifiers: [ScopedNullifier; MAX_NEW_NULLIFIERS_PER_TX],
    nullifier_tree_root: Field,
    master_secret_keys: [GrumpkinPrivateKey; MAX_KEY_VALIDATION_REQUESTS_PER_TX],
    app_secret_keys_generators: [Field; MAX_KEY_VALIDATION_REQUESTS_PER_TX],
}

impl PrivateValidationRequestProcessor {
    pub fn validate(self) -> ValidationRequests {
        let remaining_note_hash_read_requests = self.validate_note_hash_read_requests();
        let remaining_nullifier_read_requests = self.validate_nullifier_read_requests();
        let remaining_key_validation_requests = self.validate_keys();

        ValidationRequests {
            for_rollup: self.validation_requests.for_rollup,
            nullifier_non_existent_read_requests: self.validation_requests.nullifier_non_existent_read_requests,
            public_data_reads: self.validation_requests.public_data_reads,
            note_hash_read_requests: remaining_note_hash_read_requests.storage,
            nullifier_read_requests: remaining_nullifier_read_requests.storage,
            key_validation_requests: remaining_key_validation_requests.storage
        }
    }

    fn validate_note_hash_read_requests(self) -> BoundedVec<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX> {
        reset_read_requests(
            self.validation_requests.note_hash_read_requests,
            self.pending_note_hashes,
            self.note_hash_read_request_hints.read_request_statuses,
            self.note_hash_read_request_hints.pending_read_hints,
            self.note_hash_read_request_hints.settled_read_hints,
            self.note_hash_tree_root
        )
    }

    fn validate_nullifier_read_requests(self) -> BoundedVec<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX> {
        reset_read_requests(
            self.validation_requests.nullifier_read_requests,
            self.pending_nullifiers,
            self.nullifier_read_request_hints.read_request_statuses,
            self.nullifier_read_request_hints.pending_read_hints,
            self.nullifier_read_request_hints.settled_read_hints,
            self.nullifier_tree_root
        )
    }

    fn validate_keys(self) -> BoundedVec<ScopedKeyValidationRequest, MAX_KEY_VALIDATION_REQUESTS_PER_TX> {
        let mut should_propagate = [false; MAX_KEY_VALIDATION_REQUESTS_PER_TX];
        let requests = self.validation_requests.key_validation_requests;
        for i in 0..MAX_KEY_VALIDATION_REQUESTS_PER_TX {
            let request = requests[i].request;
            if !is_empty(request) {
                let contract_address = requests[i].contract_address;
                let sk_m = self.master_secret_keys[i];
                if !is_empty(sk_m) {
                    // First we check that derived public key matches master public key from request
                    let pk_m = sk_m.derive_public_key();
                    assert(
                        pk_m.eq(request.pk_m), "Failed to derive matching master public key from the secret key."
                    );

                    // Then we check that siloing the master secret key with the contract address gives the app secret key

                    let sk_app = poseidon2_hash(
                        [
                        sk_m.high, sk_m.low, contract_address.to_field(), self.app_secret_keys_generators[i]
                    ]
                    );
                    assert(
                        sk_app.eq(request.sk_app), "Failed to derive matching app secret key from the secret key."
                    );
                } else {
                    should_propagate[i] = true;
                }
            }
        }

        filter_array_to_bounded_vec(requests, should_propagate)
    }
}
