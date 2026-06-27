use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::constrain_preexisting_handshake_secret, handshake::create_non_interactive_handshake,
};
use crate::protocol::address::AztecAddress;
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

global EXISTING_HANDSHAKE: u8 = 1;
global NEW_NON_INTERACTIVE_HANDSHAKE: u8 = 2;
global UNCONSTRAINED_SECRET: u8 = 3;

/// How a message's tagging secret is sourced and, for constrained delivery, constrained.
pub(crate) struct TagSecretSource {
    kind: u8,
    secret: Field,
}

impl TagSecretSource {
    /// Reuses the secret of a handshake already registered for the pair (mode-agnostic).
    pub(crate) fn existing_handshake(secret: Field) -> Self {
        Self { kind: EXISTING_HANDSHAKE, secret }
    }

    /// Establishes a fresh non-interactive handshake, publishing information about the recipient onchain.
    pub(crate) fn new_non_interactive_handshake() -> Self {
        Self { kind: NEW_NON_INTERACTIVE_HANDSHAKE, secret: 0 }
    }

    /// A ready-to-use unconstrained secret the wallet resolved. Sound only for unconstrained delivery.
    pub(crate) fn unconstrained_secret(secret: Field) -> Self {
        Self { kind: UNCONSTRAINED_SECRET, secret }
    }

    /// Returns the app-siloed tagging secret, performing any handshake creation the source requires.
    pub(crate) fn obtain_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> Field {
        if self.kind == NEW_NON_INTERACTIVE_HANDSHAKE {
            create_non_interactive_handshake(
                context,
                STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
                sender,
                recipient,
            )
        } else {
            // An existing or unconstrained secret is already resolved; only a fresh handshake must be created.
            self.secret
        }
    }

    /// Constrains `(secret, index)` for constrained delivery, each source proving its secret its own way. A source
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
        } else if self.kind == NEW_NON_INTERACTIVE_HANDSHAKE {
            // The secret was already obtained in a constrained manner, so we only need to verify that the index is 0.
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
    use crate::oracle::execution_cache;
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::TagSecretSource;
    use std::test::OracleMock;

    global SENDER: AztecAddress = AztecAddress::from_field(1);
    global RECIPIENT: AztecAddress = AztecAddress::from_field(8);

    #[test]
    unconstrained fn existing_handshake_obtains_its_secret() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            assert_eq(TagSecretSource::existing_handshake(42).obtain_secret(context, SENDER, RECIPIENT), 42);
        });
    }

    #[test]
    unconstrained fn unconstrained_secret_obtains_its_secret() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            assert_eq(TagSecretSource::unconstrained_secret(42).obtain_secret(context, SENDER, RECIPIENT), 42);
        });
    }

    #[test]
    unconstrained fn new_non_interactive_handshake_obtains_the_bootstrapped_secret() {
        let env = TestEnvironment::new();
        let secret: Field = 7;

        env.private_context(|context| {
            // The registry's `non_interactive_handshake` call returns the app-siloed secret via the returns cache.
            let returns_hash = hash_args([secret]);
            execution_cache::store([secret], returns_hash);
            let child_call_end_counter = context.side_effect_counter + 1;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, returns_hash))
                .times(1);

            assert_eq(
                TagSecretSource::new_non_interactive_handshake().obtain_secret(context, SENDER, RECIPIENT),
                secret,
            );
        });
    }

    // A freshly bootstrapped handshake secret is the source of truth, so its sequence must start at index 0.
    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            TagSecretSource::new_non_interactive_handshake().constrain_secret(
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
            TagSecretSource::unconstrained_secret(7).constrain_secret(
                context,
                AztecAddress::zero(),
                AztecAddress::zero(),
                7,
                0,
            );
        });
    }
}
