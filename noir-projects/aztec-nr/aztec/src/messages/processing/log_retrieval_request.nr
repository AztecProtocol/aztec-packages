use protocol_types::{address::AztecAddress, traits::Serialize};

#[derive(Serialize)]
pub(crate) struct LogRetrievalRequest {
    pub contract_address: AztecAddress,
    pub unsiloed_tag: Field,
    // TODO(#15052): choose source: public, private or either (current behavior)
}

mod test {
    use super::LogRetrievalRequest;
    use protocol_types::{address::AztecAddress, traits::{FromField, Serialize}};

    #[test]
    fn serialization_matches_typescript() {
        let request =
            LogRetrievalRequest { contract_address: AztecAddress::from_field(1), unsiloed_tag: 2 };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from the
        // snapshot value below, then log_retrieval_request.test.ts must be updated with the same value.
        // Ideally we'd autogenerate this, but for now we only have single-sided snapshot generation, from TS to Noir,
        // which is not what we need here.
        let expected_serialization = [
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000002,
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
