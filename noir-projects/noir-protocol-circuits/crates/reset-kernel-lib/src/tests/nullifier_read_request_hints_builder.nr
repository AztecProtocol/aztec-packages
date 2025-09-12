use crate::{
    nullifier_read_request_reset::{NullifierReadRequestHints, NullifierSettledReadHint},
    reset::read_request::{PendingReadHint, ReadRequestAction, SettledReadHint},
};
use dep::types::{constants::MAX_NULLIFIER_READ_REQUESTS_PER_TX, traits::Empty};

pub struct NullifierReadRequestHintsBuilder<let PendingHintsLen: u32, let SettledHintsLen: u32> {
    pub read_request_actions: [ReadRequestAction; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    pub pending_read_hints: BoundedVec<PendingReadHint, PendingHintsLen>,
    pub settled_read_hints: BoundedVec<NullifierSettledReadHint, SettledHintsLen>,
}

impl<let PendingHintsLen: u32, let SettledHintsLen: u32> NullifierReadRequestHintsBuilder<PendingHintsLen, SettledHintsLen> {
    pub fn new() -> Self {
        NullifierReadRequestHintsBuilder {
            read_request_actions: [ReadRequestAction::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX); PendingHintsLen],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [
                    NullifierSettledReadHint::skip(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
                         SettledHintsLen
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

    pub fn to_hints(self) -> NullifierReadRequestHints<PendingHintsLen, SettledHintsLen> {
        NullifierReadRequestHints {
            read_request_actions: self.read_request_actions,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
