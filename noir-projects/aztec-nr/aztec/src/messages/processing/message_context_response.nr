use crate::protocol::constants::MAX_NOTE_HASHES_PER_TX;
use crate::protocol::traits::Deserialize;

/// Response containing the transaction context needed to process an offchain-delivered message.
#[derive(Deserialize, Eq)]
pub struct MessageContextResponse {
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
}
