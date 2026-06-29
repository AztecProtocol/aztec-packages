use crate::{event::EventSelector, messages::logs::event::MAX_EVENT_SERIALIZED_LEN};
use crate::protocol::{address::AztecAddress, traits::Serialize};

/// Intermediate struct used to perform batch event validation by PXE. The
/// `aztec_utl_validateAndStoreEnqueuedNotesAndEvents` oracle expects for values of this type to be stored in an
/// `EphemeralArray` at the given `base_slot`.
#[derive(Serialize)]
pub(crate) struct EventValidationRequest {
    contract_address: AztecAddress,
    event_type_id: EventSelector,
    randomness: Field,
    max_event_serialized_len: Field,
    serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    event_commitment: Field,
    tx_hash: Field,
}

impl EventValidationRequest {
    pub(crate) fn new(
        contract_address: AztecAddress,
        event_type_id: EventSelector,
        randomness: Field,
        serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
        event_commitment: Field,
        tx_hash: Field,
    ) -> Self {
        Self {
            contract_address,
            event_type_id,
            randomness,
            max_event_serialized_len: MAX_EVENT_SERIALIZED_LEN as Field,
            serialized_event,
            event_commitment,
            tx_hash,
        }
    }
}
