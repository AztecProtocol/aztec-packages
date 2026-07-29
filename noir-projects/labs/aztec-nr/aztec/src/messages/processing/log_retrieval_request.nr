use crate::protocol::{address::AztecAddress, traits::Serialize};

pub struct LogSourceEnum {
    pub PRIVATE: Field,
    pub PUBLIC: Field,
    pub PUBLIC_AND_PRIVATE: Field,
}

pub global LogSource: LogSourceEnum = LogSourceEnum { PRIVATE: 0, PUBLIC: 1, PUBLIC_AND_PRIVATE: 2 };

/// A request for the `bulk_retrieve_logs` oracle to fetch all logs matching a tag.
#[derive(Serialize)]
pub struct LogRetrievalRequest {
    pub contract_address: AztecAddress,
    pub unsiloed_tag: Field,
    /// Which log source to query: public, private, or both (the default). See [`LogSource`].
    pub source: Field,
    /// Inclusive lower bound on block number. When unset, logs from the first block are included.
    pub from_block: Option<Field>,
    /// Exclusive upper bound on block number. When unset, logs up to the anchor block are included.
    pub to_block: Option<Field>,
}

impl LogRetrievalRequest {
    /// Creates a request that queries both public and private logs with no block range filter.
    pub(crate) fn new(contract_address: AztecAddress, unsiloed_tag: Field) -> Self {
        LogRetrievalRequest {
            contract_address,
            unsiloed_tag,
            source: LogSource.PUBLIC_AND_PRIVATE,
            from_block: Option::none(),
            to_block: Option::none(),
        }
    }
}
