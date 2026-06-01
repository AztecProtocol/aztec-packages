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
