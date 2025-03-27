use protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    traits::{Deserialize, Serialize},
};

#[derive(Deserialize, Serialize)]
pub(crate) struct LogCapsule {
    pub log: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    pub tx_hash: Field,
    pub unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    pub first_nullifier_in_tx: Field,
    pub recipient: AztecAddress,
}
