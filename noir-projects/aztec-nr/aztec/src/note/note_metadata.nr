use protocol_types::traits::Serialize;

// There's temporarily quite a bit of boilerplate here because Noir does not yet support enums. This file will
// eventually be simplified into something closer to:
//
// pub enum NoteMetadata {
//   PendingSamePhase{ note_hash_counter: u32 },
//   PendingOtherPhase{ note_hash_counter: u32, note_nonce: Field },
//   Settled{ note_nonce: Field },
// }
//
// For now, we have `NoteMetadata` acting as a sort of tagged union.

struct NoteStageEnum {
    /// A note that was created in the transaction that is currently being executed, during the current execution phase,
    /// i.e. non-revertible or revertible.
    ///
    /// These notes are not yet in the note hash tree, though they will be inserted unless nullified in this transaction
    /// (becoming a transient note).
    PENDING_SAME_PHASE: u8,
    /// A note that was created in the transaction that is currently being executed, during the previous execution
    /// phase. Because there are only two phases and their order is always the same (first non-revertible and then
    /// revertible) this implies that the note was created in the non-revertible phase, and that the current phase is
    /// the revertible phase.
    ///
    /// These notes are not yet in the note hash tree, though they will be inserted **even if nullified in this
    /// transaction**. This means that they must be nullified as if they were settled (i.e. using the unique note hash)
    /// in order to avoid double spends once they become settled.
    PENDING_PREVIOUS_PHASE: u8,
    /// A note that was created in a prior transaction and is therefore already in the note hash tree.
    SETTLED: u8,
}

global NoteStage: NoteStageEnum =
    NoteStageEnum { PENDING_SAME_PHASE: 1, PENDING_PREVIOUS_PHASE: 2, SETTLED: 3 };

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a note in any of the three valid stages (pending same phase, pending previous phase, or settled). In
/// order to access the underlying fields callers must first find the appropriate stage (e.g. via `is_settled()`) and
/// then convert this into the appropriate type (e.g. via `to_settled()`).
#[derive(Eq, Serialize)]
pub struct NoteMetadata {
    stage: u8,
    maybe_note_nonce: Field,
}

impl NoteMetadata {
    /// Constructs a `NoteMetadata` object from optional note hash counter and nonce. Both a zero note hash counter and
    /// a zero nonce are invalid, so those are used to signal non-existent values.
    pub fn from_raw_data(nonzero_note_hash_counter: bool, maybe_note_nonce: Field) -> Self {
        if nonzero_note_hash_counter {
            if maybe_note_nonce == 0 {
                Self { stage: NoteStage.PENDING_SAME_PHASE, maybe_note_nonce }
            } else {
                Self { stage: NoteStage.PENDING_PREVIOUS_PHASE, maybe_note_nonce }
            }
        } else if maybe_note_nonce != 0 {
            Self { stage: NoteStage.SETTLED, maybe_note_nonce }
        } else {
            panic(
                f"Note has a zero note hash counter and no nonce - existence cannot be proven",
            )
        }
    }

    /// Returns true if the note is pending **and** from the same phase, i.e. if it's been created in the current
    /// transaction during the current execution phase (either non-revertible or revertible).
    pub fn is_pending_same_phase(self) -> bool {
        self.stage == NoteStage.PENDING_SAME_PHASE
    }

    /// Returns true if the note is pending **and** from the previous phase, i.e. if it's been created in the current
    /// transaction during an execution phase prior to the current one. Because private execution only has two phases
    /// with strict ordering, this implies that the note was created in the non-revertible phase, and that the current
    /// phase is the revertible phase.
    pub fn is_pending_previous_phase(self) -> bool {
        self.stage == NoteStage.PENDING_PREVIOUS_PHASE
    }

    /// Returns true if the note is settled, i.e. if it's been created in a prior transaction and is therefore already
    /// in the note hash tree.
    pub fn is_settled(self) -> bool {
        self.stage == NoteStage.SETTLED
    }

    /// Asserts that the metadata is that of a pending note from the same phase and converts it accordingly.
    pub fn to_pending_same_phase(self) -> PendingSamePhaseNoteMetadata {
        assert_eq(self.stage, NoteStage.PENDING_SAME_PHASE);
        PendingSamePhaseNoteMetadata::new()
    }

    /// Asserts that the metadata is that of a pending note from a previous phase and converts it accordingly.
    pub fn to_pending_previous_phase(self) -> PendingPreviousPhaseNoteMetadata {
        assert_eq(self.stage, NoteStage.PENDING_PREVIOUS_PHASE);
        PendingPreviousPhaseNoteMetadata::new(self.maybe_note_nonce)
    }

    /// Asserts that the metadata is that of a settled note and converts it accordingly.
    pub fn to_settled(self) -> SettledNoteMetadata {
        assert_eq(self.stage, NoteStage.SETTLED);
        SettledNoteMetadata::new(self.maybe_note_nonce)
    }
}

impl From<PendingSamePhaseNoteMetadata> for NoteMetadata {
    fn from(_value: PendingSamePhaseNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(true, std::mem::zeroed())
    }
}

impl From<PendingPreviousPhaseNoteMetadata> for NoteMetadata {
    fn from(value: PendingPreviousPhaseNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(true, value.note_nonce())
    }
}

impl From<SettledNoteMetadata> for NoteMetadata {
    fn from(value: SettledNoteMetadata) -> Self {
        NoteMetadata::from_raw_data(false, value.note_nonce())
    }
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a pending same phase note, i.e. a note that was created in the transaction that is currently being
/// executed during the current execution phase (either non-revertible or revertible).
pub struct PendingSamePhaseNoteMetadata {
    // This struct contains no fields since there is no metadata associated with a pending same phase note: it has no
    // nonce (since it may get squashed by a nullifier emitted in the same phase), and while it does have a note hash
    // counter we cannot constrain its value (and don't need to - only that it is non-zero).
}

impl PendingSamePhaseNoteMetadata {
    pub fn new() -> Self {
        Self {}
    }
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a pending previous phase note, i.e. a note that was created in the transaction that is currently
/// being executed, during the previous execution phase. Because there are only two phases and their order is always the
/// same (first non-revertible and then revertible) this implies that the note was created in the non-revertible phase,
/// and that the current phase is the revertible phase.
pub struct PendingPreviousPhaseNoteMetadata {
    note_nonce: Field,
    // This struct does not contain a note hash counter, even though one exists for this note, because we cannot
    // constrain its value (and don't need to - only that it is non-zero).
}

impl PendingPreviousPhaseNoteMetadata {
    pub fn new(note_nonce: Field) -> Self {
        Self { note_nonce }
    }

    pub fn note_nonce(self) -> Field {
        self.note_nonce
    }
}

/// The metadata required to both prove a note's existence and destroy it, by computing the correct note hash for kernel
/// read requests, as well as the correct nullifier to avoid double-spends.
///
/// This represents a settled note, i.e. a note that was created in a prior transaction and is therefore already in the
/// note hash tree.
pub struct SettledNoteMetadata {
    note_nonce: Field,
}

impl SettledNoteMetadata {
    pub fn new(note_nonce: Field) -> Self {
        Self { note_nonce }
    }

    pub fn note_nonce(self) -> Field {
        self.note_nonce
    }
}
