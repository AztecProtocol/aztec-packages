use crate::messages::discovery::private_notes::MAX_NOTE_PACKED_LEN;
use protocol_types::{address::AztecAddress, traits::Serialize};

#[derive(Serialize)]
pub(crate) struct NotePendingValidation {
    pub contract_address: AztecAddress,
    pub storage_slot: Field,
    pub nonce: Field,
    pub packed_note: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    pub note_hash: Field,
    pub nullifier: Field,
    pub tx_hash: Field,
    pub recipient: AztecAddress,
}
