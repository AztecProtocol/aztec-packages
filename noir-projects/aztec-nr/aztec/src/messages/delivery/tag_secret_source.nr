use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::{constrain_preexisting_handshake_secrets, emit_sequence_nullifier},
    handshake::{AppSiloedHandshakeSecrets, create_interactive_handshake, create_non_interactive_handshake},
};
use crate::protocol::address::AztecAddress;
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

global EXISTING_HANDSHAKE: u8 = 1;
global NEW_NON_INTERACTIVE_HANDSHAKE: u8 = 2;
global UNCONSTRAINED_SECRET: u8 = 3;
global NEW_INTERACTIVE_HANDSHAKE: u8 = 4;

/// How a message's tag secret is sourced and, for constrained delivery, constrained.
#[derive(Eq)]
pub(crate) struct TagSecretSource {
    kind: u8,
    /// The secret the message tag derives from. Every source resolves to exactly one.
    tag_secret: Field,
    /// The handshake sender-only secret, folded into the constrained-delivery sequence nullifier. Only meaningful
    /// for handshake-backed sources.
    sender_only: Field,
}

impl TagSecretSource {
    /// Reuses the secrets of a handshake already registered for the pair (mode-agnostic).
    pub(crate) fn existing_handshake(secrets: AppSiloedHandshakeSecrets) -> Self {
        Self { kind: EXISTING_HANDSHAKE, tag_secret: secrets.shared, sender_only: secrets.sender_only }
    }

    /// Establishes a fresh non-interactive handshake, publishing information about the recipient onchain.
    pub(crate) fn new_non_interactive_handshake() -> Self {
        Self { kind: NEW_NON_INTERACTIVE_HANDSHAKE, tag_secret: 0, sender_only: 0 }
    }

    /// Establishes a fresh interactive handshake, publishing nothing about the recipient onchain. See
    /// [`create_interactive_handshake`](super::handshake::create_interactive_handshake) for how the registry obtains
    /// the recipient's signed authorization.
    pub(crate) fn new_interactive_handshake() -> Self {
        Self { kind: NEW_INTERACTIVE_HANDSHAKE, tag_secret: 0, sender_only: 0 }
    }

    /// A ready-to-use unconstrained secret the wallet resolved. Sound only for unconstrained delivery, which never
    /// anchors a sequence, so no sender-only secret is involved.
    pub(crate) fn unconstrained_secret(secret: Field) -> Self {
        Self { kind: UNCONSTRAINED_SECRET, tag_secret: secret, sender_only: 0 }
    }

    /// Returns the tag secret backing the message tag, performing any handshake creation the source requires.
    pub(crate) fn resolve_tag_secret(
        &mut self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> Field {
        if self.kind == NEW_NON_INTERACTIVE_HANDSHAKE {
            let secrets = create_non_interactive_handshake(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
            );
            self.tag_secret = secrets.shared;
            self.sender_only = secrets.sender_only;
        } else if self.kind == NEW_INTERACTIVE_HANDSHAKE {
            let secrets = create_interactive_handshake(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
            );
            self.tag_secret = secrets.shared;
            self.sender_only = secrets.sender_only;
        }
        self.tag_secret
    }

    /// Constrains `(tag secret, index)` for constrained delivery and emits the sequence nullifier, each source
    /// proving its secrets its own way. A source that cannot back constrained delivery rejects it here. Only called
    /// for constrained delivery, after [`Self::resolve_tag_secret`].
    pub(crate) fn constrain_tag_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        index: u32,
    ) {
        let secrets = AppSiloedHandshakeSecrets { shared: self.tag_secret, sender_only: self.sender_only };
        if self.kind == EXISTING_HANDSHAKE {
            constrain_preexisting_handshake_secrets(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
                secrets,
                index,
            );
        } else if (self.kind == NEW_NON_INTERACTIVE_HANDSHAKE) | (self.kind == NEW_INTERACTIVE_HANDSHAKE) {
            // The secrets were already obtained in a constrained manner, so we only need to verify that the index is 0.
            assert(index == 0, "freshly bootstrapped secret must start at index 0");
        } else {
            panic(
                "an unconstrained tagging secret cannot back constrained delivery",
            );
        }
        emit_sequence_nullifier(context, sender, recipient, secrets, index);
    }
}

mod test {
    use crate::context::PrivateContext;
    use crate::hash::hash_args;
    use crate::messages::delivery::constrained_delivery::compute_constrained_msg_nullifier;
    use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
    use crate::oracle::execution_cache;
    use crate::protocol::{address::AztecAddress, traits::{FromField, Serialize}};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::TagSecretSource;
    use std::test::OracleMock;

    global SENDER: AztecAddress = AztecAddress::from_field(1);
    global RECIPIENT: AztecAddress = AztecAddress::from_field(8);

    #[test]
    unconstrained fn existing_handshake_resolves_and_constrains_its_secrets() {
        let env = TestEnvironment::new();
        let secrets = AppSiloedHandshakeSecrets { shared: 42, sender_only: 7 };
        let index: u32 = 3;

        env.private_context(|context| {
            let _ = OracleMock::mock("aztec_prv_isNullifierPending").returns(false).times(1);

            let mut source = TagSecretSource::existing_handshake(secrets);
            assert_eq(source.resolve_tag_secret(context, SENDER, RECIPIENT), secrets.shared);

            source.constrain_tag_secret(context, SENDER, RECIPIENT, index);
            assert_emitted_sequence_nullifier(context, secrets, index);
        });
    }

    #[test]
    unconstrained fn unconstrained_secret_resolves_its_secret() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            let mut source = TagSecretSource::unconstrained_secret(42);
            assert_eq(source.resolve_tag_secret(context, SENDER, RECIPIENT), 42);
        });
    }

    #[test]
    unconstrained fn new_non_interactive_handshake_resolves_and_constrains_the_bootstrapped_secrets() {
        let env = TestEnvironment::new();
        let secrets = AppSiloedHandshakeSecrets { shared: 7, sender_only: 9 };

        env.private_context(|context| {
            // The registry's `non_interactive_handshake` call returns the app-siloed secrets via the returns cache.
            let returns = secrets.serialize();
            let returns_hash = hash_args(returns);
            execution_cache::store(returns, returns_hash);
            let child_call_end_counter = context.get_side_effect_counter() + 1;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, returns_hash))
                .times(1);

            let mut source = TagSecretSource::new_non_interactive_handshake();
            assert_eq(source.resolve_tag_secret(context, SENDER, RECIPIENT), secrets.shared);

            source.constrain_tag_secret(context, SENDER, RECIPIENT, 0);
            assert_emitted_sequence_nullifier(context, secrets, 0);
        });
    }

    #[test]
    unconstrained fn new_interactive_handshake_resolves_and_constrains_the_bootstrapped_secrets() {
        let env = TestEnvironment::new();
        let secrets = AppSiloedHandshakeSecrets { shared: 12, sender_only: 34 };

        env.private_context(|context| {
            // The registry's `interactive_handshake` call returns the app-siloed secrets via the returns cache.
            let returns = secrets.serialize();
            let returns_hash = hash_args(returns);
            execution_cache::store(returns, returns_hash);
            let child_call_end_counter = context.get_side_effect_counter() + 1;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, returns_hash))
                .times(1);

            let mut source = TagSecretSource::new_interactive_handshake();
            assert_eq(source.resolve_tag_secret(context, SENDER, RECIPIENT), secrets.shared);

            source.constrain_tag_secret(context, SENDER, RECIPIENT, 0);
            assert_emitted_sequence_nullifier(context, secrets, 0);
        });
    }

    // A freshly bootstrapped handshake secret is the source of truth, so its sequence must start at index 0.
    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::new_non_interactive_handshake().constrain_tag_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                1,
            );
        });
    }

    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_interactive_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::new_interactive_handshake().constrain_tag_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                1,
            );
        });
    }

    #[test(should_fail_with = "an unconstrained tagging secret cannot back constrained delivery")]
    unconstrained fn unconstrained_secret_cannot_back_constrained_delivery() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::unconstrained_secret(7).constrain_tag_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                0,
            );
        });
    }

    unconstrained fn assert_emitted_sequence_nullifier(
        context: &mut PrivateContext,
        secrets: AppSiloedHandshakeSecrets,
        index: u32,
    ) {
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(
            context.nullifiers.get(0).inner.value,
            compute_constrained_msg_nullifier(SENDER, RECIPIENT, secrets, index),
        );
    }
}
