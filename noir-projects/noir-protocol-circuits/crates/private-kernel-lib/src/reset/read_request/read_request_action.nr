use ::types::traits::Empty;

struct ReadRequestActionEnum {
    pub SKIP: u8,
    pub READ_AS_PENDING: u8,
    pub READ_AS_SETTLED: u8,
}

pub global ReadRequestActions: ReadRequestActionEnum =
    ReadRequestActionEnum { SKIP: 0, READ_AS_PENDING: 1, READ_AS_SETTLED: 2 };

/// Every note_read_request and nullifier_read_request that has been passed-into the Reset Kernel circuit
/// is accompanied by one of these ReadRequestAction hints, which conveys how the Reset Kernel should
/// handle that read request:
/// - SKIP it (propagate the read request to a future iteration of the reset circuit: for cases where
///   there are more read requests than a single reset kernel iteration can process).
/// - Read it as "PENDING": prove that the item (note_hash (or nullifier)) exists in the kernel's own
///   accumulated list of note_hashes (or nullifiers) that have so-far been emitted by functions of
///   this tx. A "pending" note (or nullifier) is a note which was created by a function of this tx,
///   and so has not yet been inserted into the Note Hashes (or Nullifiers) state tree.
/// - Read it as "SETTLED": prove that the item (note_hash (or nullifier)) exists as a leaf in the
///   protocol's Note Hashes (or Nullifiers) state tree. A "settled" note (or nullifier) is a note
///   which was created by a tx of an earlier Aztec block, and as such has been fully "settled": it
///   has been inserted into the appropriate tree.
///
///
/// When action == READ_AS_PENDING:
/// - `hint_index` indexes into `read_request_hints.pending_read_hints`
/// - In turn, that PendingReadHint contains a `pending_value_index` pointing to which pending
///   note (or nullifier) of `previous_kernel.end.note_hashes` (or `.nullifiers`) satisfies the request.
///
/// When action == READ_AS_SETTLED:
/// - `hint_index` indexes into `read_request_hints.settled_read_hints`
/// - In turn, that SettledReadHint contains the Merkle membership witness proving the value exists in the tree
///
/// When action == SKIP:
/// - `hint_index` is unused // Q: do we constrain it to be something in this case?
#[derive(Eq)]
pub struct ReadRequestAction {
    // `action` only takes values from the enum { SKIP: 0, READ_AS_PENDING: 1, READ_AS_SETTLED: 2 }
    // Note: any other values in [3,255] are treated as SKIP in `validate_pending_read_requests`.
    pub action: u8,
    pub hint_index: u32,
}

impl Empty for ReadRequestAction {
    fn empty() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }
}

// Methods used in tests.
impl ReadRequestAction {
    pub fn skip() -> Self {
        ReadRequestAction { action: ReadRequestActions.SKIP, hint_index: 0 }
    }

    pub fn read_pending(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_PENDING, hint_index }
    }

    pub fn read_settled(hint_index: u32) -> Self {
        ReadRequestAction { action: ReadRequestActions.READ_AS_SETTLED, hint_index }
    }
}
