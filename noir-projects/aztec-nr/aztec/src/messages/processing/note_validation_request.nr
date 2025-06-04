use crate::messages::discovery::private_notes::MAX_NOTE_PACKED_LEN;
use protocol_types::{address::AztecAddress, traits::Serialize};

/// Intermediate struct used to perform batch note validation by PXE. The `validateEnqueuedNotesAndEvents` oracle
/// expects for values of this type to be stored in a `CapsuleArray`.
#[derive(Serialize)]
pub(crate) struct NoteValidationRequest {
    pub contract_address: AztecAddress,
    pub storage_slot: Field,
    pub nonce: Field,
    pub packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    pub note_hash: Field,
    pub nullifier: Field,
    pub tx_hash: Field,
    pub recipient: AztecAddress,
}

mod test {
    use super::NoteValidationRequest;
    use protocol_types::{address::AztecAddress, traits::{FromField, Serialize}};

    #[test]
    fn serialization_matches_typescript() {
        let request = NoteValidationRequest {
            contract_address: AztecAddress::from_field(1),
            storage_slot: 2,
            nonce: 3,
            packed_note: BoundedVec::from_array([4, 5]),
            note_hash: 6,
            nullifier: 7,
            tx_hash: 8,
            recipient: AztecAddress::from_field(9),
        };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from the
        // snapshot value below, then note_validation_request.test.ts must be updated with the same value.
        // Ideally we'd autogenerate this, but for now we only have single-sided snapshot generation, from TS to Noir,
        // which is not what we need here.
        let expected_serialization = [
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000003,
            0x0000000000000000000000000000000000000000000000000000000000000004,
            0x0000000000000000000000000000000000000000000000000000000000000005,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000000,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x0000000000000000000000000000000000000000000000000000000000000006,
            0x0000000000000000000000000000000000000000000000000000000000000007,
            0x0000000000000000000000000000000000000000000000000000000000000008,
            0x0000000000000000000000000000000000000000000000000000000000000009,
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
