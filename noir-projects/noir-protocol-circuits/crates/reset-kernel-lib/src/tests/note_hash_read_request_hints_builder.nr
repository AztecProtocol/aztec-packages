use crate::{
    note_hash_read_request_reset::{NoteHashReadRequestHints, NoteHashSettledReadHint},
    reset::read_request::{PendingReadHint, ReadRequestAction, SettledReadHint},
};
use dep::types::{constants::MAX_NOTE_HASH_READ_REQUESTS_PER_TX, traits::Empty};

pub struct NoteHashReadRequestHintsBuilder<let PENDING_HINTS_LEN: u32, let SETTLED_HINTS_LEN: u32> {
    pub read_request_actions: [ReadRequestAction; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    pub pending_read_hints: BoundedVec<PendingReadHint, PENDING_HINTS_LEN>,
    pub settled_read_hints: BoundedVec<NoteHashSettledReadHint, SETTLED_HINTS_LEN>,
}

impl<let PENDING_HINTS_LEN: u32, let SETTLED_HINTS_LEN: u32> NoteHashReadRequestHintsBuilder<PENDING_HINTS_LEN, SETTLED_HINTS_LEN> {
    pub fn new() -> Self {
        NoteHashReadRequestHintsBuilder {
            read_request_actions: [ReadRequestAction::empty(); MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::skip(MAX_NOTE_HASH_READ_REQUESTS_PER_TX); PENDING_HINTS_LEN],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [
                    NoteHashSettledReadHint::skip(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
                         SETTLED_HINTS_LEN
                    ],
                0,
            ),
        }
    }

    pub fn add_pending_read_hint(&mut self, read_request_index: u32, note_hash_index: u32) {
        let hint_index = self.pending_read_hints.len();
        let hint = PendingReadHint { read_request_index, pending_value_index: note_hash_index };
        self.pending_read_hints.push(hint);
        self.read_request_actions[read_request_index] =
            ReadRequestAction::set_as_pending(hint_index);
    }

    pub fn to_hints(self) -> NoteHashReadRequestHints<PENDING_HINTS_LEN, SETTLED_HINTS_LEN> {
        NoteHashReadRequestHints {
            read_request_actions: self.read_request_actions,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
