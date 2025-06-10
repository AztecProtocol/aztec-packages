use protocol_types::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    traits::{Deserialize, Serialize},
};

/// Additional information needed to process a message.
#[derive(Deserialize, Serialize)]
pub struct MessageContext {
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub recipient: AztecAddress,
}
