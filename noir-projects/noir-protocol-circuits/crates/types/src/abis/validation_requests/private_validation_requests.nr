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
        MAX_NULLIFIER_READ_REQUESTS_PER_TX, PRIVATE_VALIDATION_REQUESTS_LENGTH,
    },
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateValidationRequests {
    pub for_rollup: RollupValidationRequests,
    pub note_hash_read_requests: [ScopedReadRequest; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    pub nullifier_read_requests: [ScopedReadRequest; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    pub scoped_key_validation_requests_and_generators: [ScopedKeyValidationRequestAndGenerator; MAX_KEY_VALIDATION_REQUESTS_PER_TX],
    pub split_counter: Option<u32>,
}

impl Empty for PrivateValidationRequests {
    fn empty() -> Self {
        PrivateValidationRequests {
            for_rollup: RollupValidationRequests::empty(),
            note_hash_read_requests: [
                ScopedReadRequest::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX
            ],
            nullifier_read_requests: [
                ScopedReadRequest::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX
            ],
            scoped_key_validation_requests_and_generators: [
                ScopedKeyValidationRequestAndGenerator::empty(); MAX_KEY_VALIDATION_REQUESTS_PER_TX
            ],
            split_counter: Option::none(),
        }
    }
}

mod test {
    use crate::{
        abis::validation_requests::private_validation_requests::PrivateValidationRequests,
        constants::PRIVATE_VALIDATION_REQUESTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_private_validation_requests() {
        let item = PrivateValidationRequests::empty();
        // We use the PRIVATE_VALIDATION_REQUESTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; PRIVATE_VALIDATION_REQUESTS_LENGTH] = item.serialize();
        let deserialized = PrivateValidationRequests::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
