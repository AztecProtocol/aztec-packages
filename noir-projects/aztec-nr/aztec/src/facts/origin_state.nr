use crate::protocol::{traits::{Deserialize, Serialize}, utils::reader::Reader};

/// Chain state of a retractable fact's origin block, mirroring the L2 chain tips.
///
/// Noir has no enums, so this wraps a `u8` discriminant. `pending` means the origin block is above the proven tip
/// (still reorg-able), `proven` means it has a proof on L1 but is not yet finalized (confidence, not safety), and
/// `finalized` means it is L1-finalized and therefore irreversible — the only retraction-proof state.
#[derive(Serialize)]
pub struct OriginState {
    inner: u8,
}

impl OriginState {
    pub fn pending() -> Self {
        Self { inner: 1 }
    }

    pub fn proven() -> Self {
        Self { inner: 2 }
    }

    pub fn finalized() -> Self {
        Self { inner: 3 }
    }

    fn from_u8(inner: u8) -> Self {
        let state = Self { inner };
        assert(state.is_valid(), "unrecognized origin state");
        state
    }

    fn is_valid(self) -> bool {
        (self == Self::pending()) | (self == Self::proven()) | (self == Self::finalized())
    }
}

impl Eq for OriginState {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl Deserialize for OriginState {
    let N: u32 = <u8 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Deserialize>::deserialize(fields))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self::from_u8(reader.read() as u8)
    }
}
