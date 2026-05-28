use crate::messages::logs::note::MAX_NOTE_PACKED_LEN;
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}};

/// Intermediate struct used to perform batch note validation by PXE. The
/// `aztec_utl_validateAndStoreEnqueuedNotesAndEvents` oracle expects for values of this type to be stored in a
/// `EphemeralArray`.
#[derive(Serialize, Deserialize)]
pub struct NoteValidationRequest {
    contract_address: AztecAddress,
    owner: AztecAddress,
    storage_slot: Field,
    randomness: Field,
    note_nonce: Field,
    max_note_packed_len: Field,
    packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    note_hash: Field,
    nullifier: Field,
    tx_hash: Field,
}

impl NoteValidationRequest {
    pub fn new(
        contract_address: AztecAddress,
        owner: AztecAddress,
        storage_slot: Field,
        randomness: Field,
        note_nonce: Field,
        packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
        note_hash: Field,
        nullifier: Field,
        tx_hash: Field,
    ) -> Self {
        Self {
            contract_address,
            owner,
            storage_slot,
            randomness,
            note_nonce,
            max_note_packed_len: MAX_NOTE_PACKED_LEN as Field,
            packed_note,
            note_hash,
            nullifier,
            tx_hash,
        }
    }
}

mod test {
    use crate::messages::logs::note::MAX_NOTE_PACKED_LEN;
    use crate::protocol::{address::AztecAddress, traits::{FromField, Serialize}};
    use super::NoteValidationRequest;

    #[test]
    fn serialization_matches_typescript() {
        let request = NoteValidationRequest {
            contract_address: AztecAddress::from_field(1),
            owner: AztecAddress::from_field(50),
            storage_slot: 2,
            randomness: 42,
            note_nonce: 3,
            max_note_packed_len: MAX_NOTE_PACKED_LEN as Field,
            packed_note: BoundedVec::from_array([4, 5]),
            note_hash: 6,
            nullifier: 7,
            tx_hash: 8,
        };

        // We define the serialization in Noir and the deserialization in TS. If the deserialization changes from the
        // snapshot value below, then note_validation_request.test.ts must be updated with the same value. Ideally we'd
        // autogenerate this, but for now we only have single-sided snapshot generation, from TS to Noir, which is not
        // what we need here.
        let expected_serialization = [
            0x0000000000000000000000000000000000000000000000000000000000000001,
            0x0000000000000000000000000000000000000000000000000000000000000032,
            0x0000000000000000000000000000000000000000000000000000000000000002,
            0x000000000000000000000000000000000000000000000000000000000000002a,
            0x0000000000000000000000000000000000000000000000000000000000000003,
            MAX_NOTE_PACKED_LEN as Field,
            0x0000000000000000000000000000000000000000000000000000000000000004,
            0x0000000000000000000000000000000000000000000000000000000000000005,
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
        ];

        assert_eq(request.serialize(), expected_serialization);
    }
}
