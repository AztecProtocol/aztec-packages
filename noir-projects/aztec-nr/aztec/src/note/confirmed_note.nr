use crate::note::{HintedNote, note_metadata::NoteMetadata};
use crate::protocol::address::AztecAddress;

/// A note that has been confirmed to exist.
///
/// This struct contains the actual note content and all associated data related to it, including the note's metadata
/// and the note hash that was used to prove its existence.
///
/// Only `ConfirmedNote`s can be nullified, since emitting a nullifier for a note that does not exist is a meaningless
/// action, and in the vast majority of cases an error.
///
/// `ConfirmedNote`s can be obtained by reading notes from PXE via [crate::note::note_getter::get_note] and
/// [crate::note::note_getter::get_notes], or by confirming a [crate::note::hinted_note::HintedNote] via
/// [crate::history::note::assert_note_existed_by].
///
/// ## Pending Notes
///
/// A pending `ConfirmedNote` (i.e. one of [crate::note::note_metadata::NoteStageEnum::PENDING_SAME_PHASE] or
/// [crate::note::note_metadata::NoteStageEnum::PENDING_PREVIOUS_PHASE]) will **not** necessarily be inserted into the
/// note hash tree: if it is nullified in the same transaction, both note hash and nullifier will be squashed (deleted)
/// by the kernel, resulting in a _transient note_.
pub struct ConfirmedNote<Note> {
    pub note: Note,

    pub contract_address: AztecAddress,
    pub owner: AztecAddress,
    pub randomness: Field,
    pub storage_slot: Field,

    pub metadata: NoteMetadata,

    /// The note hash used to prove existence.
    ///
    /// Whether this note hash is unsiloed or unique depends on the note's metadata.
    pub(crate) proven_note_hash: Field,
}

impl<Note> ConfirmedNote<Note> {
    pub(crate) fn new(hinted_note: HintedNote<Note>, proven_note_hash: Field) -> Self {
        Self {
            note: hinted_note.note,
            contract_address: hinted_note.contract_address,
            owner: hinted_note.owner,
            randomness: hinted_note.randomness,
            storage_slot: hinted_note.storage_slot,
            metadata: hinted_note.metadata,
            proven_note_hash,
        }
    }
}
