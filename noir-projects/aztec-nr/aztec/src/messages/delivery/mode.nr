use crate::protocol::{traits::{Deserialize, Serialize, ToField}, utils::reader::Reader};

/// Noir does not support enums, so this wrapper models delivery variants while keeping raw discriminants private.
pub(crate) struct DeliveryMode {
    inner: u8,
}

impl DeliveryMode {
    pub(crate) fn offchain() -> Self {
        Self { inner: 1 }
    }

    pub(crate) fn onchain_unconstrained() -> Self {
        OnchainDeliveryMode::onchain_unconstrained().into()
    }

    pub(crate) fn onchain_constrained() -> Self {
        OnchainDeliveryMode::onchain_constrained().into()
    }

    pub(crate) fn assert_is_constant(self) {
        assert_constant(self.inner);
    }
}

impl Eq for DeliveryMode {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

/// The mode of an on-chain message delivery: unconstrained or constrained tagging.
///
/// This is kept separate from the private [`DeliveryMode`] wrapper because it is used in external ABIs and therefore
/// owns the serialization and validation for the on-chain-only subset.
///
/// Consumers derive modes through the delivery API, e.g.
/// `let mode: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into()`.
#[derive(Serialize)]
pub struct OnchainDeliveryMode {
    inner: u8,
}

impl OnchainDeliveryMode {
    /// On-chain delivery without constrained encryption/tagging.
    ///
    /// `unconstrained` alone is a reserved Noir keyword.
    pub(crate) fn onchain_unconstrained() -> Self {
        Self { inner: 2 }
    }

    /// On-chain delivery with constrained encryption/tagging.
    pub(crate) fn onchain_constrained() -> Self {
        Self { inner: 3 }
    }

    fn from_u8(inner: u8) -> Self {
        let mode = Self { inner };
        assert(mode.is_valid(), "unrecognized delivery mode");
        mode
    }

    /// Whether `self` is one of the valid on-chain delivery modes.
    fn is_valid(self) -> bool {
        (self == Self::onchain_unconstrained()) | (self == Self::onchain_constrained())
    }
}

impl Deserialize for OnchainDeliveryMode {
    let N: u32 = <u8 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Deserialize>::deserialize(fields))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self::from_u8(reader.read() as u8)
    }
}

impl Eq for OnchainDeliveryMode {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl ToField for OnchainDeliveryMode {
    fn to_field(self) -> Field {
        self.inner as Field
    }
}

impl From<OnchainDeliveryMode> for DeliveryMode {
    fn from(mode: OnchainDeliveryMode) -> DeliveryMode {
        DeliveryMode { inner: mode.inner }
    }
}

mod test {
    use crate::protocol::traits::{Deserialize, Serialize};
    use super::{DeliveryMode, OnchainDeliveryMode};

    #[test]
    fn onchain_delivery_modes_are_valid() {
        assert(OnchainDeliveryMode::onchain_unconstrained().is_valid());
        assert(OnchainDeliveryMode::onchain_constrained().is_valid());
    }

    #[test]
    fn mode_roundtrips_through_serialization() {
        let unconstrained_mode = OnchainDeliveryMode::onchain_unconstrained();
        let constrained_mode = OnchainDeliveryMode::onchain_constrained();

        assert(OnchainDeliveryMode::deserialize(unconstrained_mode.serialize()) == unconstrained_mode);
        assert(OnchainDeliveryMode::deserialize(constrained_mode.serialize()) == constrained_mode);
    }

    #[test(should_fail_with = "unrecognized delivery mode")]
    fn deserializing_invalid_mode_fails() {
        let _ = OnchainDeliveryMode::deserialize([99]);
    }

    #[test]
    fn delivery_mode_onchain_constructors_match_onchain_delivery_modes() {
        let unconstrained_delivery_mode: DeliveryMode = OnchainDeliveryMode::onchain_unconstrained().into();
        let constrained_delivery_mode: DeliveryMode = OnchainDeliveryMode::onchain_constrained().into();

        assert(DeliveryMode::onchain_unconstrained() == unconstrained_delivery_mode);
        assert(DeliveryMode::onchain_constrained() == constrained_delivery_mode);
    }
}
