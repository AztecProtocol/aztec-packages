use crate::messages::logs::note::MAX_NOTE_PACKED_LEN;
use crate::protocol::{constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN}, traits::Deserialize};

pub global MAX_PUBLIC_LOG_LEN_FOR_NOTE_COMPLETION: u32 = MAX_NOTE_PACKED_LEN;

pub(crate) global MAX_LOG_CONTENT_LEN: u32 = std::cmp::max(
    MAX_PUBLIC_LOG_LEN_FOR_NOTE_COMPLETION,
    PRIVATE_LOG_CIPHERTEXT_LEN,
);

/// A response to a `LogRetrievalRequest`, containing the payload of a log (i.e. the content minus the tag, called
/// plaintext for public logs and ciphertext for private), plus contextual information about the transaction in which
/// the log was emitted. This is the data required in order to discover notes that are being delivered in a log.
#[derive(Deserialize, Eq)]
pub struct LogRetrievalResponse {
    pub log_payload: BoundedVec<Field, MAX_LOG_CONTENT_LEN>,
    pub tx_hash: Field,
    /// The array of new note hashes created by `tx_hash`
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    /// The first nullifier created by `tx_hash`
    pub first_nullifier_in_tx: Field,
    /// The number of the block in which `tx_hash` was included
    pub block_number: u32,
    /// The timestamp of the block in which `tx_hash` was included
    pub block_timestamp: u64,
    /// The hash of the block in which `tx_hash` was included
    pub block_hash: Field,
}
