use crate::{
    public_data_read_request_reset::PublicDataReadRequestHints,
    reset::{mutable_data_read_request::SettledDataReadHint, read_request::{PendingReadHint, ReadRequestStatus}}
};
use dep::types::constants::MAX_PUBLIC_DATA_READS_PER_TX;

struct PublicDataReadRequestHintsBuilder {
    read_request_statuses: [ReadRequestStatus; MAX_PUBLIC_DATA_READS_PER_TX],
    pending_read_hints: BoundedVec<PendingReadHint, MAX_PUBLIC_DATA_READS_PER_TX>,
    settled_read_hints: BoundedVec<SettledDataReadHint, MAX_PUBLIC_DATA_READS_PER_TX>,
}

impl PublicDataReadRequestHintsBuilder {
    pub fn new(read_request_len: u64) -> Self {
        PublicDataReadRequestHintsBuilder {
            read_request_statuses: [ReadRequestStatus::empty(); MAX_PUBLIC_DATA_READS_PER_TX],
            pending_read_hints: BoundedVec { storage: [PendingReadHint::nada(read_request_len); MAX_PUBLIC_DATA_READS_PER_TX], len: 0 },
            settled_read_hints: BoundedVec { storage: [SettledDataReadHint::nada(read_request_len); MAX_PUBLIC_DATA_READS_PER_TX], len: 0 }
        }
    }

    pub fn to_hints(self) -> PublicDataReadRequestHints {
        PublicDataReadRequestHints {
            read_request_statuses: self.read_request_statuses,
            pending_read_hints: self.pending_read_hints.storage,
            settled_read_hints: self.settled_read_hints.storage
        }
    }
}
