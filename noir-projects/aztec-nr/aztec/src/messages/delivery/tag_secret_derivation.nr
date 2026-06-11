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
}

impl Eq for TagSecretDerivation {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}
