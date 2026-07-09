use crate::keys::ecdh_shared_secret::compute_app_siloed_shared_secret;
use crate::protocol::{
    address::AztecAddress,
    hash::poseidon2_hash,
    point::EmbeddedCurvePoint,
    traits::{Deserialize, Serialize, ToField},
    utils::reader::Reader,
};

global NON_INTERACTIVE_HANDSHAKE: u8 = 1;
global ARBITRARY_SECRET: u8 = 2;
global ADDRESS_DERIVED: u8 = 3;
global INTERACTIVE_HANDSHAKE: u8 = 4;

/// How a message's tagging secret is chosen: the wallet's strategy.
///
/// This type only exists for tests: a Noir test sets it via `with_default_tag_secret_strategy` on
/// [`TestEnvironmentOptions`](crate::test::helpers::test_environment::TestEnvironmentOptions).
/// Production wallets express the strategy in PXE; the Noir path only consumes the resolved
/// [`ResolvedTaggingStrategy`](crate::messages::delivery::ResolvedTaggingStrategy).
#[derive(Eq, Serialize)]
pub struct TaggingSecretStrategy {
    kind: u8,
    secret: EmbeddedCurvePoint,
}

impl TaggingSecretStrategy {
    /// A secret established through a non-interactive handshake.
    pub fn non_interactive_handshake() -> Self {
        Self { kind: NON_INTERACTIVE_HANDSHAKE, secret: EmbeddedCurvePoint { x: 0, y: 0 } }
    }

    /// A secret established through an interactive handshake.
    pub fn interactive_handshake() -> Self {
        Self { kind: INTERACTIVE_HANDSHAKE, secret: EmbeddedCurvePoint { x: 0, y: 0 } }
    }

    /// A secret derived from the sender's and recipient's address keys via Diffie-Hellman.
    ///
    /// The PXE performs the key exchange, so the wallet supplies no material.
    pub fn address_derived() -> Self {
        Self { kind: ADDRESS_DERIVED, secret: EmbeddedCurvePoint { x: 0, y: 0 } }
    }

    /// A raw shared secret point the two parties already share offchain, supplied by the wallet.
    ///
    /// The PXE app-silos the point before use.
    pub fn arbitrary_secret(secret: EmbeddedCurvePoint) -> Self {
        Self { kind: ARBITRARY_SECRET, secret }
    }

    /// Validates a raw discriminant, as deserialization must always reject unknown values.
    fn from_parts(kind: u8, secret: EmbeddedCurvePoint) -> Self {
        let strategy = Self { kind, secret };
        let is_no_payload_strategy =
            (kind == NON_INTERACTIVE_HANDSHAKE) | (kind == INTERACTIVE_HANDSHAKE) | (kind == ADDRESS_DERIVED);
        assert(
            (is_no_payload_strategy & secret.is_infinite()) | (kind == ARBITRARY_SECRET),
            f"unrecognized tagging secret strategy kind: {kind}",
        );
        strategy
    }
}

/// Computes the directional tagging secret PXE derives from an arbitrary shared secret point: the point is app-siloed
/// and the recipient is folded in for direction. Mirrors `AppTaggingSecret.computeDirectional` on the PXE side; tests
/// use it to derive the secret they expect an [`arbitrary_secret`](TaggingSecretStrategy::arbitrary_secret) strategy
/// to produce.
pub fn compute_directional_app_secret(secret: EmbeddedCurvePoint, app: AztecAddress, recipient: AztecAddress) -> Field {
    poseidon2_hash(
        [compute_app_siloed_shared_secret(secret, app), recipient.to_field()],
    )
}

impl Deserialize for TaggingSecretStrategy {
    let N: u32 = 3;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_parts(
            fields[0] as u8,
            EmbeddedCurvePoint::deserialize([fields[1], fields[2]]),
        )
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let kind = reader.read() as u8;
        let secret = EmbeddedCurvePoint::deserialize([reader.read(), reader.read()]);
        Self::from_parts(kind, secret)
    }
}

mod test {
    use crate::protocol::{point::EmbeddedCurvePoint, traits::{Deserialize, Serialize}};
    use super::TaggingSecretStrategy;

    #[test]
    fn strategy_roundtrips_through_serialization() {
        let non_interactive = TaggingSecretStrategy::non_interactive_handshake();
        let interactive = TaggingSecretStrategy::interactive_handshake();
        let address = TaggingSecretStrategy::address_derived();
        let provided = TaggingSecretStrategy::arbitrary_secret(EmbeddedCurvePoint { x: 7, y: 11 });

        assert(TaggingSecretStrategy::deserialize(non_interactive.serialize()) == non_interactive);
        assert(TaggingSecretStrategy::deserialize(interactive.serialize()) == interactive);
        assert(TaggingSecretStrategy::deserialize(address.serialize()) == address);
        assert(TaggingSecretStrategy::deserialize(provided.serialize()) == provided);
    }

    #[test(should_fail_with = "unrecognized tagging secret strategy kind")]
    fn deserializing_invalid_kind_fails() {
        let _ = TaggingSecretStrategy::deserialize([99, 0, 0]);
    }

    #[test(should_fail_with = "unrecognized tagging secret strategy kind")]
    fn deserializing_handshake_with_noninfinite_point_fails() {
        let _ = TaggingSecretStrategy::deserialize([
            TaggingSecretStrategy::non_interactive_handshake().kind as Field,
            7,
            11,
        ]);
    }

    #[test(should_fail_with = "unrecognized tagging secret strategy kind")]
    fn deserializing_address_derived_with_noninfinite_point_fails() {
        let _ = TaggingSecretStrategy::deserialize(
            [TaggingSecretStrategy::address_derived().kind as Field, 7, 11],
        );
    }

    #[test(should_fail_with = "unrecognized tagging secret strategy kind")]
    fn deserializing_interactive_handshake_with_noninfinite_point_fails() {
        let _ = TaggingSecretStrategy::deserialize([TaggingSecretStrategy::interactive_handshake().kind as Field, 7, 11]);
    }
}
