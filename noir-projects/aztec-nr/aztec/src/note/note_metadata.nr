use protocol_types::traits::Serialize;

// There's temporarily quite a bit of boilerplate here since Noir does not yet support enums. This file will eventually
// be simplified into something closer to:
//
// pub enum NoteMetadata {
//   Transient{ note_hash_counter: u32 },
//   TransientNonRevertible{ note_hash_counter: u32, nonce: Field },
//   Settled{ nonce: Field },
// }
//
// For now, we have `NoteMetadata` acting as a sort of tagged union.

/// The different stages in which a note can be.
///  - TRANSIENT_REVERTIBLE: a note that was created in the transaction that is currently being executed during the
///    revertible phase
///  - TRANSIENT_NON_REVERTIBLE: same as transient, except the note was created during the non-revertible phase
///  - SETTLED: a note that was created in a prior transaction and is therefore in the note hash tree
struct NoteStageEnum {
    TRANSIENT_REVERTIBLE: u8,
    TRANSIENT_NON_REVERTIBLE: u8,
    SETTLED: u8,
}

global NoteStage: NoteStageEnum =
    NoteStageEnum { TRANSIENT_REVERTIBLE: 1, TRANSIENT_NON_REVERTIBLE: 2, SETTLED: 3 };

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a note in any of the tree valid stages (transient revertible, transient non-revertible or settled),
/// in order to access the underlying fields callers must first find the appropriate stage (e.g. via `is_settled()`) and
/// then convert this into the appropriate type (e.g. via `to_settled()`).
#[derive(Eq, Serialize)]
pub struct NoteMetadata {
    stage: u8,
    // todo: replace with a boolean
    maybe_note_hash_counter: u32,
    maybe_nonce: Field,
}

impl NoteMetadata {
    /// Constructs a `NoteMetadata` object from optional note hash and nullifiers. Both a zero note hash counter and a
    /// zero nonce are invalid, so those are used to signal non-existent values.
    pub fn from_raw_data(maybe_note_hash_counter: u32, maybe_nonce: Field) -> Self {
        if maybe_note_hash_counter != 0 {
            if maybe_nonce == 0 {
                Self { stage: NoteStage.TRANSIENT_REVERTIBLE, maybe_note_hash_counter, maybe_nonce }
            } else {
                Self {
                    stage: NoteStage.TRANSIENT_NON_REVERTIBLE,
                    maybe_note_hash_counter,
                    maybe_nonce,
                }
            }
        } else if maybe_nonce != 0 {
            Self { stage: NoteStage.SETTLED, maybe_note_hash_counter, maybe_nonce }
        } else {
            panic(
                f"Note has no note hash counter nor nonce - existence cannot be proven",
            )
        }
    }

    /// Returns true if the note is transient and revertible, i.e. if it's been created in the current transaction
    /// during the revertible phase.
    ///
    /// To test if the note is transient consider doing `!metadata.is_settled()`.
    pub fn is_transient_revertible(self) -> bool {
        self.stage == NoteStage.TRANSIENT_REVERTIBLE
    }

    /// Returns true if the note is transient and non-revertible, i.e. if it's been created in the current transaction
    /// during the non-revertible phase.
    ///
    /// To test if the note is transient consider doing `!metadata.is_settled()`.
    pub fn is_transient_non_revertible(self) -> bool {
        self.stage == NoteStage.TRANSIENT_NON_REVERTIBLE
    }

    /// Returns true if the note is settled, i.e. if it's been created in a prior transaction and is therefore in the
    /// note hash tree.
    pub fn is_settled(self) -> bool {
        self.stage == NoteStage.SETTLED
    }

    /// Asserts that the metadata is that of a transient revertible note and converts it accordingly.
    pub fn to_transient_revertible(self) -> TransientRevertibleNoteMetadata {
        assert_eq(self.stage, NoteStage.TRANSIENT_REVERTIBLE);
        TransientRevertibleNoteMetadata { note_hash_counter: self.maybe_note_hash_counter }
    }

    /// Asserts that the metadata is that of a transient non-revertible note and converts it accordingly.
    pub fn to_transient_non_revertible(self) -> TransientNonRevertibleNoteMetadata {
        assert_eq(self.stage, NoteStage.TRANSIENT_NON_REVERTIBLE);
        TransientNonRevertibleNoteMetadata {
            note_hash_counter: self.maybe_note_hash_counter,
            nonce: self.maybe_nonce,
        }
    }

    /// Asserts that the metadata is that of a settled note and converts it accordingly.
    pub fn to_settled(self) -> SettledNoteMetadata {
        assert_eq(self.stage, NoteStage.SETTLED);
        SettledNoteMetadata { nonce: self.maybe_nonce }
    }
}

impl From<TransientRevertibleNoteMetadata> for NoteMetadata {
    fn from(value: TransientRevertibleNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(value.note_hash_counter(), std::mem::zeroed())
    }
}

impl From<TransientNonRevertibleNoteMetadata> for NoteMetadata {
    fn from(value: TransientNonRevertibleNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(value.note_hash_counter(), value.nonce())
    }
}

impl From<SettledNoteMetadata> for NoteMetadata {
    fn from(value: SettledNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(std::mem::zeroed(), value.nonce())
    }
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a transient revertible note, i.e. a note that was created in the transaction that is currently being
/// executed during the revertible phase.
pub struct TransientRevertibleNoteMetadata {
    note_hash_counter: u32,
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a transient non-revertible note, i.e. a note that was created in a prior transaction and is
/// therefore in the note hash tree.
impl TransientRevertibleNoteMetadata {
    pub fn new(note_hash_counter: u32) -> Self {
        Self { note_hash_counter }
    }

    pub fn note_hash_counter(self) -> u32 {
        self.note_hash_counter
    }
}

pub struct TransientNonRevertibleNoteMetadata {
    note_hash_counter: u32,
    nonce: Field,
}

impl TransientNonRevertibleNoteMetadata {
    pub fn new(note_hash_counter: u32, nonce: Field) -> Self {
        Self { note_hash_counter, nonce }
    }

    pub fn note_hash_counter(self) -> u32 {
        self.note_hash_counter
    }

    pub fn nonce(self) -> Field {
        self.nonce
    }
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a settled note, i.e. a note that was created in the transaction that is currently
/// being executed during the non-revertible phase.
pub struct SettledNoteMetadata {
    nonce: Field,
}

impl SettledNoteMetadata {
    pub fn new(nonce: Field) -> Self {
        Self { nonce }
    }

    pub fn nonce(self) -> Field {
        self.nonce
    }
}
