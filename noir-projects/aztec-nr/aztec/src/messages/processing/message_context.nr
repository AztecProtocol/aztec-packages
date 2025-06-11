use protocol_types::{
    address::AztecAddress,
    constants::MAX_NOTE_HASHES_PER_TX,
    traits::{Deserialize, Serialize},
};

/// Additional information needed to process a message.
///
/// All messages exist in the context of a transaction, and information about that transaction is typically required
/// in order to perform validation, store results, etc. For example, messages containing notes require knowledge of note
/// hashes and the first nullifier in order to find the note's nonce.
#[derive(Deserialize, Serialize)]
pub struct MessageContext {
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub recipient: AztecAddress,
}
