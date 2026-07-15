use crate::protocol::{constants::MAX_NOTE_HASHES_PER_TX, traits::{Deserialize, Serialize}};

/// The resolved on-chain context of a transaction.
#[derive(Serialize, Deserialize, Eq)]
pub struct ResolvedTx {
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub block_number: u32,
    pub block_hash: Field,
}
