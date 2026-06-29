use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::constrain_preexisting_handshake_secrets,
    handshake::{AppSiloedHandshakeSecrets, create_non_interactive_handshake},
};
use crate::protocol::address::AztecAddress;
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

global EXISTING_HANDSHAKE: u8 = 1;
global NEW_NON_INTERACTIVE_HANDSHAKE: u8 = 2;
global UNCONSTRAINED_SECRET: u8 = 3;

/// How a message's tagging secrets are sourced and, for constrained delivery, constrained.
pub(crate) struct TagSecretSource {
    kind: u8,
    secrets: AppSiloedHandshakeSecrets,
}

impl TagSecretSource {
    /// Reuses the secrets of a handshake already registered for the pair (mode-agnostic).
    pub(crate) fn existing_handshake(secrets: AppSiloedHandshakeSecrets) -> Self {
        Self { kind: EXISTING_HANDSHAKE, secrets }
    }

    /// Establishes a fresh non-interactive handshake, publishing information about the recipient onchain.
    pub(crate) fn new_non_interactive_handshake() -> Self {
        Self {
            kind: NEW_NON_INTERACTIVE_HANDSHAKE,
            secrets: AppSiloedHandshakeSecrets { shared: 0, sender_only: 0 },
        }
    }

    /// A ready-to-use unconstrained secret the wallet resolved. Sound only for unconstrained delivery, which derives
    /// the discovery tag from the shared secret alone and never folds in a sender-only secret.
    pub(crate) fn unconstrained_secret(secret: Field) -> Self {
        Self {
            kind: UNCONSTRAINED_SECRET,
            secrets: AppSiloedHandshakeSecrets { shared: secret, sender_only: 0 },
        }
    }

    /// Returns the app-siloed handshake secrets, performing any handshake creation the source requires.
    pub(crate) fn obtain_secrets(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> AppSiloedHandshakeSecrets {
        if self.kind == NEW_NON_INTERACTIVE_HANDSHAKE {
            create_non_interactive_handshake(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
            )
        } else {
            // An existing or unconstrained secret is already resolved; only a fresh handshake must be created.
            self.secrets
        }
    }

    /// Constrains `(secrets, index)` for constrained delivery, each source proving its secrets its own way. A source
    /// that cannot back constrained delivery rejects it here. Only called for constrained delivery.
    pub(crate) fn constrain_secrets(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        secrets: AppSiloedHandshakeSecrets,
        index: u32,
    ) {
        if self.kind == EXISTING_HANDSHAKE {
            constrain_preexisting_handshake_secrets(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
                secrets,
                index,
            );
        } else if self.kind == NEW_NON_INTERACTIVE_HANDSHAKE {
            // The secrets were already obtained in a constrained manner, so we only need to verify that the index is 0.
            assert(index == 0, "freshly bootstrapped secret must start at index 0");
        } else {
            panic(
                "an unconstrained tagging secret cannot back constrained delivery",
            );
        }
    }
}

mod test {
    use crate::hash::hash_args;
    use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
    use crate::oracle::execution_cache;
    use crate::protocol::{address::AztecAddress, traits::{FromField, Serialize}};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::TagSecretSource;
    use std::test::OracleMock;

    global SENDER: AztecAddress = AztecAddress::from_field(1);
    global RECIPIENT: AztecAddress = AztecAddress::from_field(8);

    #[test]
    unconstrained fn existing_handshake_obtains_its_secrets() {
        let env = TestEnvironment::new();
        let secrets = AppSiloedHandshakeSecrets { shared: 42, sender_only: 7 };
        env.private_context(|context| {
            assert_eq(
                TagSecretSource::existing_handshake(secrets).obtain_secrets(context, SENDER, RECIPIENT),
                secrets,
            );
        });
    }

    #[test]
    unconstrained fn unconstrained_secret_obtains_its_secret() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            assert_eq(
                TagSecretSource::unconstrained_secret(42).obtain_secrets(context, SENDER, RECIPIENT).shared,
                42,
            );
        });
    }

    #[test]
    unconstrained fn new_non_interactive_handshake_obtains_the_bootstrapped_secrets() {
        let env = TestEnvironment::new();
        let secrets = AppSiloedHandshakeSecrets { shared: 7, sender_only: 9 };

        env.private_context(|context| {
            // The registry's `non_interactive_handshake` call returns the app-siloed secrets via the returns cache.
            let returns = secrets.serialize();
            let returns_hash = hash_args(returns);
            execution_cache::store(returns, returns_hash);
            let child_call_end_counter = context.side_effect_counter + 1;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, returns_hash))
                .times(1);

            assert_eq(
                TagSecretSource::new_non_interactive_handshake().obtain_secrets(context, SENDER, RECIPIENT),
                secrets,
            );
        });
    }

    // A freshly bootstrapped handshake secret is the source of truth, so its sequence must start at index 0.
    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::new_non_interactive_handshake().constrain_secrets(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                AppSiloedHandshakeSecrets { shared: 0, sender_only: 0 },
                1,
            );
        });
    }

    #[test(should_fail_with = "an unconstrained tagging secret cannot back constrained delivery")]
    unconstrained fn unconstrained_secret_cannot_back_constrained_delivery() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::unconstrained_secret(7).constrain_secrets(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                AppSiloedHandshakeSecrets { shared: 7, sender_only: 0 },
                0,
            );
        });
    }
}
