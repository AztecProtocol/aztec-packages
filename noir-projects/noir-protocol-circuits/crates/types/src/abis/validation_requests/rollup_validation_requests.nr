use crate::{
    abis::include_by_timestamp::IncludeByTimestamp,
    constants::ROLLUP_VALIDATION_REQUESTS_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};

// These are validation requests that cannot be fulfilled in the current context (private or public), and must be
// instead forwarded to the rollup for it to take care of them.
pub struct RollupValidationRequests {
    pub include_by_timestamp: IncludeByTimestamp,
}

impl Empty for RollupValidationRequests {
    fn empty() -> Self {
        RollupValidationRequests { include_by_timestamp: IncludeByTimestamp::empty() }
    }
}

impl Serialize<ROLLUP_VALIDATION_REQUESTS_LENGTH> for RollupValidationRequests {
    fn serialize(self) -> [Field; ROLLUP_VALIDATION_REQUESTS_LENGTH] {
        IncludeByTimestamp::serialize(self.include_by_timestamp)
    }
}

impl Deserialize<ROLLUP_VALIDATION_REQUESTS_LENGTH> for RollupValidationRequests {
    fn deserialize(fields: [Field; ROLLUP_VALIDATION_REQUESTS_LENGTH]) -> RollupValidationRequests {
        let mut reader = Reader::new(fields);
        let item =
            Self { include_by_timestamp: reader.read_struct(IncludeByTimestamp::deserialize) };
        reader.finish();
        item
    }
}

impl Eq for RollupValidationRequests {
    fn eq(self, other: Self) -> bool {
        self.include_by_timestamp.eq(other.include_by_timestamp)
    }
}

#[test]
fn serialization_of_empty() {
    let item = RollupValidationRequests::empty();
    let serialized = item.serialize();
    let deserialized = RollupValidationRequests::deserialize(serialized);
    assert(item.eq(deserialized));
}
