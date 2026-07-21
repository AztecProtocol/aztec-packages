use aztec::{
    messages::encoding::MAX_MESSAGE_CONTENT_LEN,
    protocol::{hash::poseidon2_hash_bytes, traits::{Deserialize, Serialize}},
};

/// Domain separator for deriving the capsule slot of a pending multi-log event from its message_id.
pub global MULTI_LOG_PARTS_SEPARATOR: Field =
    comptime { poseidon2_hash_bytes("CUSTOM_MSG::MULTI_LOG_PARTS".as_bytes()) };

/// Accumulates parts of a multi-log event in a single capsule. Each part is placed at its index in the `parts`
/// array. A part with `len() == 0` has not yet arrived. `N` is the maximum number of parts.
#[derive(Serialize, Deserialize)]
pub struct MultiLog<let N: u32> {
    pub parts: [BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>; N],
}

impl<let N: u32> MultiLog<N> {
    /// Returns true if the given part has already been received.
    pub unconstrained fn has_received_part(self, part_number: u32) -> bool {
        self.parts[part_number].len() != 0
    }

    /// Returns true if all parts have been received.
    pub unconstrained fn is_complete(self) -> bool {
        let mut complete = true;
        for i in 0..N {
            if !self.has_received_part(i) {
                complete = false;
            }
        }
        complete
    }

    /// Packs part_number and N (total_parts) into a u64 for use as msg_metadata.
    pub fn pack_part_metadata(part_number: u32) -> u64 {
        (part_number as u64) * 0x100000000 + (N as u64)
    }

    /// Unpacks part_number from msg_metadata.
    pub unconstrained fn unpack_part_number(packed: u64) -> u32 {
        (packed / 0x100000000) as u32
    }

    /// Unpacks total_parts from msg_metadata.
    pub unconstrained fn unpack_total_parts(packed: u64) -> u32 {
        (packed % 0x100000000) as u32
    }
}
