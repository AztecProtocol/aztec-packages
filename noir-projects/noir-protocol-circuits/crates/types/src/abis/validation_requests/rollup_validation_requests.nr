use crate::{
    abis::include_by_timestamp::IncludeByTimestamp,
    traits::{Deserialize, Empty, Serialize},
};

// These are validation requests that cannot be fulfilled in the current context (private or public), and must be
// instead forwarded to the rollup for it to take care of them.
#[derive(Deserialize, Eq, Serialize)]
pub struct RollupValidationRequests {
    pub include_by_timestamp: IncludeByTimestamp,
}

impl Empty for RollupValidationRequests {
    fn empty() -> Self {
        RollupValidationRequests { include_by_timestamp: IncludeByTimestamp::empty() }
    }
}
