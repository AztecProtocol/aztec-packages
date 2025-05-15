use crate::{abis::max_block_number::MaxBlockNumber, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

// These are validation requests that cannot be fulfilled in the current context (private or public), and must be
// instead forwarded to the rollup for it to take care of them.
#[derive(Deserialize, Eq, Serialize)]
pub struct RollupValidationRequests {
    pub max_block_number: MaxBlockNumber,
}

impl Empty for RollupValidationRequests {
    fn empty() -> Self {
        RollupValidationRequests { max_block_number: MaxBlockNumber::empty() }
    }
}

mod test {
    use crate::{
        abis::validation_requests::rollup_validation_requests::RollupValidationRequests,
        constants::ROLLUP_VALIDATION_REQUESTS_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_rollup_validation_requests() {
        let item = RollupValidationRequests::empty();
        // We use the ROLLUP_VALIDATION_REQUESTS_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; ROLLUP_VALIDATION_REQUESTS_LENGTH] = item.serialize();
        let deserialized = RollupValidationRequests::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
