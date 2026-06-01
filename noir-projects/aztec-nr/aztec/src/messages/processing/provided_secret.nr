use crate::protocol::traits::Serialize;

pub(crate) struct ProvidedSecretKindEnum {
    pub UNCONSTRAINED: Field,
    pub CONSTRAINED: Field,
}

/// Delivery modes for a [`ProvidedSecret`]. The numeric values match the TypeScript
/// `AppTaggingSecretKind` ordering so they round-trip across the oracle boundary.
pub(crate) global ProvidedSecretKind: ProvidedSecretKindEnum =
    ProvidedSecretKindEnum { UNCONSTRAINED: 0, CONSTRAINED: 1 };

/// A tagging secret the app supplies explicitly to `get_pending_tagged_logs`.
///
/// These are searched alongside the secrets PXE derives or stores internally, and exist for secrets PXE cannot
/// enumerate on its own (e.g. handshake-derived ones). A provided secret carries its mode explicitly: `mode` selects
/// both the tag domain separator and the index discipline used when searching for its logs.
#[derive(Serialize)]
pub(crate) struct ProvidedSecret {
    pub secret: Field,
    pub mode: Field,
}

mod test {
    use super::{ProvidedSecret, ProvidedSecretKind};

    #[test]
    fn kind_values_match_typescript() {
        // The numeric values must match the TS `AppTaggingSecretKind` ordering so that contracts and PXE agree on
        // the wire encoding for `mode`.
        assert_eq(ProvidedSecretKind.UNCONSTRAINED, 0);
        assert_eq(ProvidedSecretKind.CONSTRAINED, 1);

        let _ = ProvidedSecret { secret: 1, mode: ProvidedSecretKind.UNCONSTRAINED };
        let _ = ProvidedSecret { secret: 2, mode: ProvidedSecretKind.CONSTRAINED };
    }
}
