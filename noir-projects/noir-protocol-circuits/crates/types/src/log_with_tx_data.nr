use crate::constants::{MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_DATA_SIZE_IN_FIELDS};

/// The contents of a public log, plus contextual information about the transaction in which the log was emitted. This
/// is the data required in order to discover notes that are being delivered in a log.
// TODO(#11639): this could also be used to fetch private logs, but the `BoundedVec` maximum length is that of a public
// log.
pub struct LogWithTxData {
    pub log_content: BoundedVec<Field, PUBLIC_LOG_DATA_SIZE_IN_FIELDS>,
    pub tx_hash: Field,
    /// The array of new note hashes created by `tx_hash`
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    /// The first nullifier created by `tx_hash`
    pub first_nullifier_in_tx: Field,
}
