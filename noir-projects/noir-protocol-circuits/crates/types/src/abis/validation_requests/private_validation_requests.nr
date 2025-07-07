use crate::{
    abis::{
        read_request::ScopedReadRequest,
        validation_requests::scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
    },
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    },
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::ClaimedLengthArray,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateValidationRequests {
    pub note_hash_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub split_counter: Option<u32>,
}

impl Empty for PrivateValidationRequests {
    fn empty() -> Self {
        let empty_note_hash_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX> =
            ClaimedLengthArray::empty();
        let empty_nullifier_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX> =
            ClaimedLengthArray::empty();
        let empty_scoped_key_validation_requests: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX> =
            ClaimedLengthArray::empty();
        PrivateValidationRequests {
            note_hash_read_requests: empty_note_hash_read_requests,
            nullifier_read_requests: empty_nullifier_read_requests,
            scoped_key_validation_requests_and_generators: empty_scoped_key_validation_requests,
            split_counter: Option::none(),
        }
    }
}
