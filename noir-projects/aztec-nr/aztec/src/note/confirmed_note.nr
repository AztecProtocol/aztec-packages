use crate::note::{hinted_note::HintedNote, note_metadata::NoteMetadata};
use protocol_types::address::AztecAddress;

/// A note that has been confirmed to exist.
///
/// This struct contains the actual note content and all associated data related to it, including metadata.
///
/// ## Pending Notes
///
/// A pending `ConfirmedNote` will **not** necessarily be inserted into the note hash tree: if it is nullified in the
/// same transaction, both note hash and nullifier will be squashed (deleted) by the kernel, resulting in a _transient
/// note_.
pub struct ConfirmedNote<Note> {
    pub note: Note,

    pub contract_address: AztecAddress,
    pub owner: AztecAddress,
    pub randomness: Field,
    pub storage_slot: Field,

    pub metadata: NoteMetadata,

    /// The note hash used in the kernel read request.
    ///
    /// Whether this note hash is unsiloed or unique depends on the note's metadata.
    pub(crate) read_request_note_hash: Field,
}

impl<Note> ConfirmedNote<Note> {
    pub(crate) fn new(hinted_note: HintedNote<Note>, read_request_note_hash: Field) -> Self {
        Self {
            note: hinted_note.note,
            contract_address: hinted_note.contract_address,
            owner: hinted_note.owner,
            randomness: hinted_note.randomness,
            storage_slot: hinted_note.storage_slot,
            metadata: hinted_note.metadata,
            read_request_note_hash,
        }
    }
}
