use crate::protocol::{address::AztecAddress, traits::Serialize};

pub(crate) struct LogSourceEnum {
    pub PRIVATE: Field,
    pub PUBLIC: Field,
    pub PUBLIC_AND_PRIVATE: Field,
}

pub(crate) global LogSource: LogSourceEnum = LogSourceEnum { PRIVATE: 0, PUBLIC: 1, PUBLIC_AND_PRIVATE: 2 };

/// A request for the `bulk_retrieve_logs` oracle to fetch all logs matching a tag.
#[derive(Serialize)]
pub(crate) struct LogRetrievalRequest {
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

mod test {
    use crate::protocol::{address::AztecAddress, traits::{FromField, Serialize}};
    use super::{LogRetrievalRequest, LogSource};

    #[test]
    fn serialization_of_defaults_matches_typescript() {
        let request = LogRetrievalRequest {
            contract_address: AztecAddress::from_field(1),
            unsiloed_tag: 2,
            source: LogSource.PUBLIC_AND_PRIVATE,
            from_block: Option::none(),
            to_block: Option::none(),
        };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from
        // the snapshot value below, then log_retrieval_request.test.ts must be updated with the same value.
        // Ideally we'd autogenerate this, but for now we only have single-sided snapshot generation, from TS to
        // Noir, which is not what we need here.
        let expected_serialization = [
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
        ];

        assert_eq(request.serialize(), expected_serialization);
    }

    #[test]
    fn serialization_with_values_matches_typescript() {
        let request = LogRetrievalRequest {
            contract_address: AztecAddress::from_field(1),
            unsiloed_tag: 2,
            source: LogSource.PUBLIC,
            from_block: Option::some(10),
            to_block: Option::some(20),
        };

        let expected_serialization = [
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x000000000000000000000000000000000000000000000000000000000000000a,
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000014,
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
