use super::mode::OnchainDeliveryMode;

/// Noir does not support enums, so this wrapper models tag-secret derivation variants.
pub(crate) struct TagSecretDerivation {
    inner: u8,
}

impl TagSecretDerivation {
    pub(crate) fn wallet_default() -> Self {
        Self { inner: 0 }
    }

    pub(crate) fn address_secret() -> Self {
        Self { inner: 1 }
    }

    pub(crate) fn non_interactive_handshake() -> Self {
        Self { inner: 2 }
    }

    pub(crate) fn assert_is_constant(self) {
        assert_constant(self.inner);
    }

    pub(crate) fn resolve_for_mode(self, mode: OnchainDeliveryMode) -> Self {
        if self == Self::wallet_default() {
            // TODO(F-699): resolve the wallet default through PXE's delivery privacy preference.
            if mode == OnchainDeliveryMode::onchain_constrained() {
                Self::non_interactive_handshake()
            } else {
                Self::address_secret()
            }
        } else {
            self
        }
    }
}

impl Eq for TagSecretDerivation {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

mod test {
    use super::{OnchainDeliveryMode, TagSecretDerivation};

    #[test]
    fn wallet_default_resolves_for_the_current_mode() {
        assert(
            TagSecretDerivation::wallet_default().resolve_for_mode(OnchainDeliveryMode::onchain_unconstrained())
                == TagSecretDerivation::address_secret(),
        );
        assert(
            TagSecretDerivation::wallet_default().resolve_for_mode(OnchainDeliveryMode::onchain_constrained())
                == TagSecretDerivation::non_interactive_handshake(),
        );
    }
}
