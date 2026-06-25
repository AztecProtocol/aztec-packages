use crate::protocol::{traits::{Deserialize, Serialize}, utils::reader::Reader};

/// Chain state of a retractable fact's origin block, mirroring the L2 chain tips.
///
/// Note: Noir has no enums, so this wraps a `u8` discriminant.
#[derive(Serialize)]
pub struct OriginBlockState {
    inner: u8,
}

impl OriginBlockState {
    pub fn pending() -> Self {
        Self { inner: 1 }
    }

    pub fn proven() -> Self {
        Self { inner: 2 }
    }

    pub fn finalized() -> Self {
        Self { inner: 3 }
    }

    /// Whether the origin block is still above the proven tip (reorg-able).
    pub fn is_pending(self) -> bool {
        self == Self::pending()
    }

    /// Whether the origin block is proven but not yet finalized.
    pub fn is_proven(self) -> bool {
        self == Self::proven()
    }

    /// Whether the origin block is finalized, the only retraction-proof state.
    pub fn is_finalized(self) -> bool {
        self == Self::finalized()
    }

    fn from_u8(inner: u8) -> Self {
        let state = Self { inner };
        assert(state.is_valid(), "unrecognized origin state");
        state
    }

    fn is_valid(self) -> bool {
        self.is_pending() | self.is_proven() | self.is_finalized()
    }
}

impl Eq for OriginBlockState {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl Deserialize for OriginBlockState {
    let N: u32 = <u8 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Deserialize>::deserialize(fields))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self::from_u8(reader.read() as u8)
    }
}

mod test {
    use crate::protocol::traits::{Deserialize, Serialize};
    use super::OriginBlockState;

    #[test]
    fn query_functions_identify_each_state() {
        assert(OriginBlockState::pending().is_pending());
        assert(!OriginBlockState::pending().is_proven());
        assert(!OriginBlockState::pending().is_finalized());

        assert(OriginBlockState::proven().is_proven());
        assert(!OriginBlockState::proven().is_pending());
        assert(!OriginBlockState::proven().is_finalized());

        assert(OriginBlockState::finalized().is_finalized());
        assert(!OriginBlockState::finalized().is_pending());
        assert(!OriginBlockState::finalized().is_proven());
    }

    #[test]
    fn origin_state_roundtrips_through_serialization() {
        let pending = OriginBlockState::pending();
        let proven = OriginBlockState::proven();
        let finalized = OriginBlockState::finalized();
        assert(OriginBlockState::deserialize(pending.serialize()) == pending);
        assert(OriginBlockState::deserialize(proven.serialize()) == proven);
        assert(OriginBlockState::deserialize(finalized.serialize()) == finalized);
    }

    #[test(should_fail_with = "unrecognized origin state")]
    fn deserializing_invalid_state_fails() {
        let _ = OriginBlockState::deserialize([99]);
    }
}
