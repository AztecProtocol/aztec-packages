use crate::{
    nullifier_read_request_reset::{NullifierReadRequestHints, NullifierSettledReadHint},
    reset::read_request::{PendingReadHint, ReadRequestStatus},
};
use dep::types::constants::MAX_NULLIFIER_READ_REQUESTS_PER_TX;

pub struct NullifierReadRequestHintsBuilder<let NUM_PENDING_HINTS: u32, let NUM_SETTLED_HINTS: u32> {
    pub read_request_statuses: [ReadRequestStatus; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    pub pending_read_hints: BoundedVec<PendingReadHint, NUM_PENDING_HINTS>,
    pub settled_read_hints: BoundedVec<NullifierSettledReadHint, NUM_SETTLED_HINTS>,
}

impl<let NUM_PENDING_HINTS: u32, let NUM_SETTLED_HINTS: u32> NullifierReadRequestHintsBuilder<NUM_PENDING_HINTS, NUM_SETTLED_HINTS> {
    pub unconstrained fn new() -> Self {
        NullifierReadRequestHintsBuilder {
            read_request_statuses: [ReadRequestStatus::empty(); MAX_NULLIFIER_READ_REQUESTS_PER_TX],
            pending_read_hints: BoundedVec::from_parts_unchecked(
                [PendingReadHint::nada(MAX_NULLIFIER_READ_REQUESTS_PER_TX); NUM_PENDING_HINTS],
                0,
            ),
            settled_read_hints: BoundedVec::from_parts_unchecked(
                [
                    NullifierSettledReadHint::nada(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
                         NUM_SETTLED_HINTS
                    ],
                    0,
                ),
            }
        }

    pub unconstrained fn to_hints(
        self,
    ) -> NullifierReadRequestHints<NUM_PENDING_HINTS, NUM_SETTLED_HINTS> {
        NullifierReadRequestHints {
            read_request_statuses: self.read_request_statuses,
            pending_read_hints: self.pending_read_hints.storage(),
            settled_read_hints: self.settled_read_hints.storage(),
        }
    }
}
