use crate::{event::EventSelector, messages::logs::event::MAX_EVENT_SERIALIZED_LEN};
use protocol_types::{address::AztecAddress, traits::Serialize};

/// Intermediate struct used to perform batch event validation by PXE. The
/// `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle expects for values of this type to be stored in
/// a `CapsuleArray` at the given `base_slot`.
#[derive(Serialize)]
pub(crate) struct EventValidationRequest {
    pub contract_address: AztecAddress,
    pub event_type_id: EventSelector,
    pub randomness: Field,
    pub serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    pub event_commitment: Field,
    pub tx_hash: Field,
    pub recipient: AztecAddress,
}

mod test {
    use crate::event::EventSelector;
    use super::EventValidationRequest;
    use protocol_types::{address::AztecAddress, traits::{FromField, Serialize}};

    #[test]
    unconstrained fn serialization_matches_typescript() {
        let request = EventValidationRequest {
            contract_address: AztecAddress::from_field(1),
            event_type_id: EventSelector::from_field(2),
            randomness: 3,
            serialized_event: BoundedVec::from_array([4, 5]),
            event_commitment: 6,
            tx_hash: 7,
            recipient: AztecAddress::from_field(8),
        };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from the
        // snapshot value below, then event_validation_request.test.ts must be updated with the same value.
        // Ideally we'd autogenerate this, but for now we only have single-sided snapshot generation, from TS to Noir,
        // which is not what we need here.
        let expected_serialization = [
            1, // contract_address
            2, // event_type_id
            3, // randomness
            4, // serialized_event[0]
            5, // serialized_event[1]
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // serialized_event padding
            2, // bounded_vec_len
            6, // event_commitment
            7, // tx_hash
            8, // recipient
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
