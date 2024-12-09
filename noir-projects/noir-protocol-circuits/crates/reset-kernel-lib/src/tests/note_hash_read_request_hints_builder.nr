use crate::{
    note_hash_read_request_reset::{NoteHashReadRequestHints, NoteHashSettledReadHint},
    reset::read_request::{PendingReadHint, ReadRequestStatus},
};
use dep::types::constants::MAX_NOTE_HASH_READ_REQUESTS_PER_TX;

pub struct NoteHashReadRequestHintsBuilder<let NUM_PENDING_HINTS: u32, let NUM_SETTLED_HINTS: u32> {
    pub read_request_statuses: [ReadRequestStatus; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    pub pending_read_hints: BoundedVec<PendingReadHint, NUM_PENDING_HINTS>,
    pub settled_read_hints: BoundedVec<NoteHashSettledReadHint, NUM_SETTLED_HINTS>,
}

impl<let NUM_PENDING_HINTS: u32, let NUM_SETTLED_HINTS: u32> NoteHashReadRequestHintsBuilder<NUM_PENDING_HINTS, NUM_SETTLED_HINTS> {
    pub unconstrained fn new() -> Self {
        NoteHashReadRequestHintsBuilder {
            read_request_statuses: [ReadRequestStatus::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::nada(MAX_NOTE_HASH_READ_REQUESTS_PER_TX); NUM_PENDING_HINTS],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [
                    NoteHashSettledReadHint::nada(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
                         NUM_SETTLED_HINTS
                    ],
                    0,
                ),
            }
        }

    pub unconstrained fn to_hints(
        self,
    ) -> NoteHashReadRequestHints<NUM_PENDING_HINTS, NUM_SETTLED_HINTS> {
        NoteHashReadRequestHints {
            read_request_statuses: self.read_request_statuses,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
