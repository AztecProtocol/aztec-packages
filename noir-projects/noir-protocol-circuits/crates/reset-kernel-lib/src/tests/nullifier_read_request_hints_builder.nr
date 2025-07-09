use crate::{
    nullifier_read_request_reset::{NullifierReadRequestHints, NullifierSettledReadHint},
    reset::read_request::{PendingReadHint, ReadRequestAction, SettledReadHint},
};
use dep::types::{constants::MAX_NULLIFIER_READ_REQUESTS_PER_TX, traits::Empty};

pub struct NullifierReadRequestHintsBuilder<let PENDING_HINTS_LEN: u32, let SETTLED_HINTS_LEN: u32> {
    pub read_request_actions: [ReadRequestAction; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    pub pending_read_hints: BoundedVec<PendingReadHint, PENDING_HINTS_LEN>,
    pub settled_read_hints: BoundedVec<NullifierSettledReadHint, SETTLED_HINTS_LEN>,
}

impl<let PENDING_HINTS_LEN: u32, let SETTLED_HINTS_LEN: u32> NullifierReadRequestHintsBuilder<PENDING_HINTS_LEN, SETTLED_HINTS_LEN> {
    pub fn new() -> Self {
        NullifierReadRequestHintsBuilder {
            read_request_actions: [ReadRequestAction::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX); PENDING_HINTS_LEN],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [
                    NullifierSettledReadHint::skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
                         SETTLED_HINTS_LEN
                    ],
                    0,
                ),
            }
        }

    pub fn add_pending_read_hint(&mut self, read_request_index: u32, nullifier_index: u32) {
        let hint_index = self.pending_read_hints.len();
        let hint = PendingReadHint { read_request_index, pending_value_index: nullifier_index };
        self.pending_read_hints.push(hint);
        self.read_request_actions[read_request_index] =
            ReadRequestAction::set_as_pending(hint_index);
    }

    pub fn to_hints(self) -> NullifierReadRequestHints<PENDING_HINTS_LEN, SETTLED_HINTS_LEN> {
        NullifierReadRequestHints {
            read_request_actions: self.read_request_actions,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
