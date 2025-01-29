use crate::constants::{MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_DATA_SIZE_IN_FIELDS};

pub struct LogWithTxData {
    pub log_content: BoundedVec<Field, PUBLIC_LOG_DATA_SIZE_IN_FIELDS>,
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
}
