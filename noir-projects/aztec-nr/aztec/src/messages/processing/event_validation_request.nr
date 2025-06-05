use crate::messages::discovery::private_events::MAX_EVENT_SERIALIZED_LEN;
use protocol_types::{abis::event_selector::EventSelector, address::AztecAddress, traits::Serialize};

/// Intermediate struct used to perform batch event validation by PXE. The `validateEnqueuedNotesAndEvents` oracle
/// expects for values of this type to be stored in a `CapsuleArray` at the given `base_slot`.
#[derive(Serialize)]
pub(crate) struct EventValidationRequest {
    pub contract_address: AztecAddress,
    pub event_type_id: EventSelector,
    pub serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    pub event_commitment: Field,
    pub tx_hash: Field,
    pub recipient: AztecAddress,
    pub log_index_in_tx: Field,
    pub tx_index_in_block: Field,
}

mod test {
    use super::EventValidationRequest;
    use protocol_types::{
        abis::event_selector::EventSelector,
        address::AztecAddress,
        traits::{FromField, Serialize},
    };

    #[test]
    unconstrained fn serialization_matches_typescript() {
        let request = EventValidationRequest {
            contract_address: AztecAddress::from_field(1),
            event_type_id: EventSelector::from_field(2),
            serialized_event: BoundedVec::from_array([3, 4]),
            event_commitment: 5,
            tx_hash: 6,
            recipient: AztecAddress::from_field(7),
            log_index_in_tx: 8,
            tx_index_in_block: 9,
        };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from the
        // snapshot value below, then event_validation_request.test.ts must be updated with the same value.
        // Ideally we'd autogenerate this, but for now we only have single-sided snapshot generation, from TS to Noir,
        // which is not what we need here.
        let expected_serialization = [
            1, // contract_address
            2, // event_type_id
            3, // serialized_event[0]
            4, // serialized_event[1]
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // serialized_event padding
            2, // bounded_vec_len
            5, // event_commitment
            6, // tx_hash
            7, // recipient
            8, // log_index_in_tx
            9, // tx_index_in_block
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
