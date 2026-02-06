use super::{
    read_request_action::ReadRequestAction, validate_pending_read_requests::PendingReadHint,
    validate_settled_read_requests::SettledReadHint,
};

pub struct ReadRequestHints<let ReadRequestLen: u32, let PendingReadHintsLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SETTLED_READ_LEAF_PREIMAGE> {
    // Each item in this array of actions corresponds to an item in the previous kernel's note_hashes (or nullifiers) read_requests array.
    // Each item hints at whether the corresponding read request should be skipped (ignored by this circuit and propagated to a later one);
    // or processed as a "pending" read (a read of a note/nullifier that was emitted by another fn of this same tx); or processed as a
    // "settled" read (a read from a state tree of a note/nullifier from some earlier tx).
    pub read_request_actions: [ReadRequestAction; ReadRequestLen],
    pub pending_read_hints: [PendingReadHint; PendingReadHintsLen],
    pub settled_read_hints: [SettledReadHint<TreeHeight, SETTLED_READ_LEAF_PREIMAGE>; SettledReadHintsLen],
}
