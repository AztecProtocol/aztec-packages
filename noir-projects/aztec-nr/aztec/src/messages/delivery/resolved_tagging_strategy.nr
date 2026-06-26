use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::constrain_preexisting_handshake_secret, handshake::create_non_interactive_handshake,
};
use crate::protocol::{address::AztecAddress, traits::{Deserialize, Serialize}, utils::reader::Reader};
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

global NON_INTERACTIVE_HANDSHAKE: u8 = 1;
global UNCONSTRAINED_SECRET: u8 = 2;
// Determined contract-side from the handshake registry, never resolved by the wallet, so it is rejected on
// deserialization (see `from_parts`) and can only be built via `existing_handshake`.
global EXISTING_HANDSHAKE: u8 = 3;

/// The source of a message's app-siloed tagging secret, and how to constrain it for constrained delivery.
///
/// One of three variants, selected at send time. An `EXISTING_HANDSHAKE` already registered for the
/// `(sender, recipient)` pair is reused, built contract-side from the registry lookup. Otherwise it is the tagging
/// secret the PXE hands to the contract after applying the wallet's tagging secret strategy: a fresh
/// `NON_INTERACTIVE_HANDSHAKE` or a ready-to-use `UNCONSTRAINED_SECRET`. It is already app-siloed, so the contract
/// uses it directly to derive the message tag and never sees raw key material.
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

    /// Reuses the secret of a handshake already registered for the pair (mode-agnostic). Built contract-side from the
    /// registry lookup, never resolved by the wallet, so it has no deserialization path.
    pub(crate) fn existing_handshake(secret: Field) -> Self {
        Self { kind: EXISTING_HANDSHAKE, secret }
    }

    /// Returns the app-siloed tagging secret, performing any handshake creation the source requires.
    pub(crate) fn obtain_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> Field {
        if self.kind == NON_INTERACTIVE_HANDSHAKE {
            create_non_interactive_handshake(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
            )
        } else if (self.kind == EXISTING_HANDSHAKE) | (self.kind == UNCONSTRAINED_SECRET) {
            self.secret
        } else {
            panic("unrecognized resolved tagging strategy kind")
        }
    }

    /// Constrains `(secret, index)` for constrained delivery, each variant proving its secret its own way. A source
    /// that cannot back constrained delivery rejects it here. Only called for constrained delivery.
    pub(crate) fn constrain_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        secret: Field,
        index: u32,
    ) {
        if self.kind == EXISTING_HANDSHAKE {
            constrain_preexisting_handshake_secret(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
                secret,
                index,
            );
        } else if self.kind == NON_INTERACTIVE_HANDSHAKE {
            // The secret was already obtained in a constrained manner, so we only need to verify that the index is 0.
            assert(index == 0, "freshly bootstrapped secret must start at index 0");
        } else if self.kind == UNCONSTRAINED_SECRET {
            // An unconstrained secret has no onchain backing to prove against.
            panic(
                "an unconstrained tagging secret cannot back constrained delivery",
            )
        } else {
            panic("unrecognized resolved tagging strategy kind")
        }
    }

    /// Validates a raw discriminant, as deserialization must always reject unknown values. Only the wallet-resolvable
    /// kinds are accepted; `EXISTING_HANDSHAKE` is determined contract-side and must never arrive over the oracle, so a
    /// wallet cannot claim a registry-backed handshake it did not establish.
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
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::{Deserialize, FromField, Serialize};
    use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::ResolvedTaggingStrategy;
    use std::test::OracleMock;

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

    // The wallet must not be able to claim a registry-backed handshake, so the contract-only kind is rejected here even
    // though `existing_handshake` builds it directly.
    #[test(should_fail_with = "unrecognized resolved tagging strategy kind")]
    fn deserializing_existing_handshake_kind_fails() {
        let _ = ResolvedTaggingStrategy::deserialize([3, 0]);
    }

    #[test]
    unconstrained fn obtain_secret_returns_the_carried_secret_for_ready_sources() {
        let env = TestEnvironment::new();
        let secret: Field = 9;

        env.private_context(|context| {
            let existing = ResolvedTaggingStrategy::existing_handshake(secret);
            let unconstrained_source = ResolvedTaggingStrategy::unconstrained_secret(secret);
            assert_eq(existing.obtain_secret(context, AztecAddress::zero(), AztecAddress::zero()), secret);
            assert_eq(unconstrained_source.obtain_secret(context, AztecAddress::zero(), AztecAddress::zero()), secret);
        });
    }

    #[test]
    unconstrained fn existing_handshake_constrains_against_the_registry() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secret: Field = 1234;

        env.private_context(|context| {
            // The real registry call is covered by integration tests; this only needs a coherent child call result so
            // `PrivateContext` records the request.
            let child_call_end_counter = context.side_effect_counter + 1;
            let empty_returns_hash: Field = 0;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, empty_returns_hash))
                .times(1);

            ResolvedTaggingStrategy::existing_handshake(secret).constrain_secret(context, sender, recipient, secret, 0);

            assert_eq(context.private_call_requests.len(), 1);
            assert_eq(
                context.private_call_requests.get(0).call_context.contract_address,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
            );
        });
    }

    // A freshly bootstrapped handshake secret is the source of truth, so its sequence must start at index 0.
    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            ResolvedTaggingStrategy::non_interactive_handshake().constrain_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                0,
                1,
            );
        });
    }

    #[test(should_fail_with = "an unconstrained tagging secret cannot back constrained delivery")]
    unconstrained fn unconstrained_secret_cannot_back_constrained_delivery() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            ResolvedTaggingStrategy::unconstrained_secret(7).constrain_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                7,
                0,
            );
        });
    }
}
