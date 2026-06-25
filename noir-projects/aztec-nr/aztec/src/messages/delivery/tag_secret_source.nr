//! Tag secret sources for on-chain message delivery.
//!
//! A [`TagSecretSource`] knows how to obtain its app-siloed tagging secret and, for constrained delivery, how to
//! constrain that secret against the handshake registry. [`derive_log_tag`](super::tag::derive_log_tag) selects a
//! source and [`tag_with`](super::tag) runs it to derive the message tag.
use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::constrain_reused_secret, handshake::create_non_interactive_handshake,
};
use crate::protocol::address::AztecAddress;
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

/// How a message's tagging secret is sourced and, for constrained delivery, constrained.
pub(crate) trait TagSecretSource {
    /// Returns the app-siloed tagging secret, performing any handshake creation the source requires.
    fn obtain_secret(self, context: &mut PrivateContext, sender: AztecAddress, recipient: AztecAddress) -> Field;

    /// Constrains `(secret, index)` for constrained delivery, each source proving its secret its own way. A source
    /// that cannot back constrained delivery rejects it here. Only called for constrained delivery.
    fn constrain_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        secret: Field,
        index: u32,
    );
}

/// Reuses the secret of a handshake already registered for the pair (mode-agnostic).
pub(crate) struct ExistingHandshake {
    pub(crate) secret: Field,
}

impl TagSecretSource for ExistingHandshake {
    fn obtain_secret(self, _context: &mut PrivateContext, _sender: AztecAddress, _recipient: AztecAddress) -> Field {
        self.secret
    }

    fn constrain_secret(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        secret: Field,
        index: u32,
    ) {
        constrain_reused_secret(
            context,
            STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
            sender,
            recipient,
            secret,
            index,
        );
    }
}

/// Establishes a fresh non-interactive handshake, publishing information about the recipient onchain.
pub(crate) struct NewNonInteractiveHandshake {}

impl TagSecretSource for NewNonInteractiveHandshake {
    fn obtain_secret(self, context: &mut PrivateContext, sender: AztecAddress, recipient: AztecAddress) -> Field {
        create_non_interactive_handshake(
            context,
            STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
            sender,
            recipient,
        )
    }

    fn constrain_secret(
        self,
        _context: &mut PrivateContext,
        _sender: AztecAddress,
        _recipient: AztecAddress,
        _secret: Field,
        index: u32,
    ) {
        // The secret was already obtained in a constrained manner, so we only need to verify that the index is 0.
        assert(index == 0, "freshly bootstrapped secret must start at index 0");
    }
}

/// A ready-to-use unconstrained secret the wallet resolved. Sound only for unconstrained delivery.
pub(crate) struct UnconstrainedSecret {
    pub(crate) secret: Field,
}

impl TagSecretSource for UnconstrainedSecret {
    fn obtain_secret(self, _context: &mut PrivateContext, _sender: AztecAddress, _recipient: AztecAddress) -> Field {
        self.secret
    }

    fn constrain_secret(
        self,
        _context: &mut PrivateContext,
        _sender: AztecAddress,
        _recipient: AztecAddress,
        _secret: Field,
        _index: u32,
    ) {
        panic(
            "an unconstrained tagging secret cannot back constrained delivery",
        )
    }
}

mod test {
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{NewNonInteractiveHandshake, TagSecretSource};

    // A freshly bootstrapped handshake secret is the source of truth, so its sequence must start at index 0.
    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn fresh_handshake_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        env.private_context(|context| {
            NewNonInteractiveHandshake {}.constrain_secret(context, AztecAddress::zero(), AztecAddress::zero(), 0, 1);
        });
    }
}
