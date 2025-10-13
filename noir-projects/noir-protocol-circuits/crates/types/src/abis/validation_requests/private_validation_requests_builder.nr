use crate::{
    abis::validation_requests::{
        key_validation_request_and_generator::KeyValidationRequestAndGenerator,
        private_validation_requests::PrivateValidationRequests,
    },
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    },
    side_effect::{Counted, Scoped},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

#[derive(Eq)]
pub struct PrivateValidationRequestsBuilder {
    pub note_hash_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: ClaimedLengthArray<Scoped<Counted<Field>>, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: ClaimedLengthArray<Scoped<KeyValidationRequestAndGenerator>, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub split_counter: Option<u32>,
}

// TODO: remove this PrivateValidationRequestsBuilder, and just construct the PrivateValidationRequests directly?
impl PrivateValidationRequestsBuilder {
    pub fn finish(self) -> PrivateValidationRequests {
        PrivateValidationRequests {
            note_hash_read_requests: self.note_hash_read_requests,
            nullifier_read_requests: self.nullifier_read_requests,
            scoped_key_validation_requests_and_generators: self
                .scoped_key_validation_requests_and_generators,
            split_counter: self.split_counter,
        }
    }
}

impl Empty for PrivateValidationRequestsBuilder {
    fn empty() -> Self {
        PrivateValidationRequestsBuilder {
            note_hash_read_requests: ClaimedLengthArray::empty(),
            nullifier_read_requests: ClaimedLengthArray::empty(),
            scoped_key_validation_requests_and_generators: ClaimedLengthArray::empty(),
            split_counter: Option::none(),
        }
    }
}
