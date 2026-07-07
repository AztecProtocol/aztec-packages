use crate::context::PrivateContext;
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}, utils::reader::Reader};
use super::tag_secret_source::TagSecretSource;

global NON_INTERACTIVE_HANDSHAKE: u8 = 1;
global UNCONSTRAINED_SECRET: u8 = 2;

/// The tagging secret the PXE hands to the contract after applying the wallet's tagging secret strategy. It is already
/// app-siloed, so the contract uses it directly to derive the message tag and never sees raw key material.
#[derive(Eq, Serialize)]
pub struct ResolvedTaggingStrategy {
    kind: u8,
    secret: Field,
}

impl ResolvedTaggingStrategy {
    /// A non-interactive handshake: the recipient re-derives the secret from the onchain handshake registry.
    pub fn non_interactive_handshake() -> Self {
        Self { kind: NON_INTERACTIVE_HANDSHAKE, secret: 0 }
    }

    /// An app-siloed, recipient-directional secret, ready to use. Only sound for unconstrained delivery.
    pub fn unconstrained_secret(secret: Field) -> Self {
        Self { kind: UNCONSTRAINED_SECRET, secret }
    }

    pub fn is_unconstrained_secret(self) -> bool {
        self.kind == UNCONSTRAINED_SECRET
    }

    /// Resolves this strategy into the [`TagSecretSource`] backing the message tag.
    pub(crate) fn into_tag_secret_source(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> TagSecretSource {
        if self.kind == NON_INTERACTIVE_HANDSHAKE {
            TagSecretSource::new_non_interactive_handshake(context, sender, recipient)
        } else {
            TagSecretSource::unconstrained_secret(self.secret)
        }
    }

    /// Validates a raw discriminant, as deserialization must always reject unknown values.
    fn from_parts(kind: u8, secret: Field) -> Self {
        let resolved = Self { kind, secret };
        assert(
            ((kind == NON_INTERACTIVE_HANDSHAKE) & (secret == 0)) | (kind == UNCONSTRAINED_SECRET),
            f"unrecognized resolved tagging strategy kind: {kind}",
        );
        resolved
    }
}

impl Deserialize for ResolvedTaggingStrategy {
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
    use super::ResolvedTaggingStrategy;

    #[test]
    fn resolved_roundtrips_through_serialization() {
        let non_interactive = ResolvedTaggingStrategy::non_interactive_handshake();
        let unconstrained_secret = ResolvedTaggingStrategy::unconstrained_secret(42);

        assert(ResolvedTaggingStrategy::deserialize(non_interactive.serialize()) == non_interactive);
        assert(ResolvedTaggingStrategy::deserialize(unconstrained_secret.serialize()) == unconstrained_secret);
    }

    #[test(should_fail_with = "unrecognized resolved tagging strategy kind")]
    fn deserializing_invalid_kind_fails() {
        let _ = ResolvedTaggingStrategy::deserialize([99, 0]);
    }

    #[test(should_fail_with = "unrecognized resolved tagging strategy kind")]
    fn deserializing_handshake_with_nonzero_secret_fails() {
        let _ = ResolvedTaggingStrategy::deserialize([1, 123]);
    }
}
