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
