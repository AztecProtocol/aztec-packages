use crate::protocol::{traits::{Deserialize, Serialize}, utils::reader::Reader};

global NON_INTERACTIVE_HANDSHAKE: u8 = 1;
global SHARED_SECRET: u8 = 2;

/// How the tagging secret for a message is sourced, as decided by the wallet through the
/// [`resolve_tagging_secret`](crate::oracle::resolve_tagging_secret) oracle.
///
/// Message delivery tags each on-chain message so the recipient can find it without scanning every log. The tag is
/// derived from a secret shared between sender and recipient. When one has already been established for the pair it is
/// reused. Otherwise, the wallet must decide how to source it: this type is that decision, carrying any material the
/// chosen derivation needs.
#[derive(Eq, Serialize)]
pub struct TaggingSecretSource {
    kind: u8,
    secret: Field,
}

impl TaggingSecretSource {
    /// A secret established through a non-interactive handshake, derivable by the recipient from the on-chain handshake
    /// registry.
    pub fn non_interactive_handshake() -> Self {
        Self { kind: NON_INTERACTIVE_HANDSHAKE, secret: 0 }
    }

    /// A secret the two parties already share off-chain: they must have coordinated somehow to both know it (e.g.
    /// derived via Diffie-Hellman from each other's address keys). Because nothing on-chain proves the recipient knows
    /// it, this is only sound for unconstrained delivery.
    pub fn shared_secret(secret: Field) -> Self {
        Self { kind: SHARED_SECRET, secret }
    }

    /// Validates a raw discriminant, as deserialization must always reject unknown values.
    fn from_parts(kind: u8, secret: Field) -> Self {
        let source = Self { kind, secret };
        assert(
            (kind == NON_INTERACTIVE_HANDSHAKE) | (kind == SHARED_SECRET),
            f"unrecognized tagging secret source kind: {kind}",
        );
        source
    }
}

impl Deserialize for TaggingSecretSource {
    let N: u32 = 2;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_parts(fields[0] as u8, fields[1])
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        let kind = reader.read() as u8;
        let secret = reader.read();
        Self::from_parts(kind, secret)
    }
}

mod test {
    use crate::protocol::traits::{Deserialize, Serialize};
    use super::TaggingSecretSource;

    #[test]
    fn source_roundtrips_through_serialization() {
        let non_interactive = TaggingSecretSource::non_interactive_handshake();
        let shared = TaggingSecretSource::shared_secret(42);

        assert(TaggingSecretSource::deserialize(non_interactive.serialize()) == non_interactive);
        assert(TaggingSecretSource::deserialize(shared.serialize()) == shared);
    }

    #[test(should_fail_with = "unrecognized tagging secret source kind")]
    fn deserializing_invalid_kind_fails() {
        let _ = TaggingSecretSource::deserialize([99, 0]);
    }
}
