use crate::{
    abis::{
        read_request::ScopedReadRequest,
        validation_requests::{
            rollup_validation_requests::RollupValidationRequests,
            scoped_key_validation_request_and_generator::ScopedKeyValidationRequestAndGenerator,
        },
    },
    constants::{
        MAX_KEY_VALIDATION_REQUESTS_PER_TX, MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    },
    traits::Empty,
    utils::arrays::AppendedUnvalidatedArray,
};

pub struct PrivateValidationRequests {
    pub for_rollup: RollupValidationRequests,
    pub note_hash_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX>,
    pub nullifier_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
    pub scoped_key_validation_requests_and_generators: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    pub split_counter: Option<u32>,
}

impl Empty for PrivateValidationRequests {
    fn empty() -> Self {
        let empty_note_hash_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let empty_nullifier_read_requests: AppendedUnvalidatedArray<ScopedReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        let empty_scoped_key_validation_requests: AppendedUnvalidatedArray<ScopedKeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_TX> =
            AppendedUnvalidatedArray::empty();
        PrivateValidationRequests {
            for_rollup: RollupValidationRequests::empty(),
            note_hash_read_requests: empty_note_hash_read_requests,
            nullifier_read_requests: empty_nullifier_read_requests,
            scoped_key_validation_requests_and_generators: empty_scoped_key_validation_requests,
            split_counter: Option::none(),
        }
    }
}

impl Eq for PrivateValidationRequests {
    fn eq(self, other: Self) -> bool {
        (self.for_rollup.eq(other.for_rollup))
            & (self.note_hash_read_requests == other.note_hash_read_requests)
            & (self.nullifier_read_requests == other.nullifier_read_requests)
            & (
                self.scoped_key_validation_requests_and_generators
                    == other.scoped_key_validation_requests_and_generators
            )
            & (self.split_counter == other.split_counter)
    }
}
