use crate::{
    abis::{
        max_block_number::MaxBlockNumber,
        read_request::ScopedReadRequest,
        validation_requests::{
            private_validation_requests::PrivateValidationRequests,
            rollup_validation_requests::RollupValidationRequests,
            scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
        },
    },
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    },
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

#[derive(Eq)]
pub struct PrivateValidationRequestsBuilder {
    pub max_block_number: MaxBlockNumber,
    pub note_hash_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: ClaimedLengthArray<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: ClaimedLengthArray<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub split_counter: Option<u32>,
}

// TODO: remove this PrivateValidationRequestsBuilder, and just construct the PrivateValidationRequests directly?
impl PrivateValidationRequestsBuilder {
    pub fn finish(self) -> PrivateValidationRequests {
        PrivateValidationRequests {
            for_rollup: self.for_rollup(),
            note_hash_read_requests: self.note_hash_read_requests,
            nullifier_read_requests: self.nullifier_read_requests,
            scoped_key_validation_requests_and_generators: self
                .scoped_key_validation_requests_and_generators,
            split_counter: self.split_counter,
        }
    }

    pub fn for_rollup(self) -> RollupValidationRequests {
        RollupValidationRequests { max_block_number: self.max_block_number }
    }
}

impl Empty for PrivateValidationRequestsBuilder {
    fn empty() -> Self {
        PrivateValidationRequestsBuilder {
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: ClaimedLengthArray::empty(),
            nullifier_read_requests: ClaimedLengthArray::empty(),
            scoped_key_validation_requests_and_generators: ClaimedLengthArray::empty(),
            split_counter: Option::none(),
        }
    }
}
