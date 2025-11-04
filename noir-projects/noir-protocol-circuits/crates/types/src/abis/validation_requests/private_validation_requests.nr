use crate::{
    abis::validation_requests::key_validation_request_and_generator::KeyValidationRequestAndGenerator,
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    },
    side_effect::{Counted, Scoped},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};
use std::meta::derive;

#[derive(Eq)]
pub struct PrivateValidationRequests {
    pub note_hash_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub split_counter: Option<u32>,
}

impl Empty for PrivateValidationRequests {
    fn empty() -> Self {
        PrivateValidationRequests {
            note_hash_read_requests: ClaimedLengthArray::empty(),
            nullifier_read_requests: ClaimedLengthArray::empty(),
            scoped_key_validation_requests_and_generators: ClaimedLengthArray::empty(),
            split_counter: Option::none(),
        }
    }
}
