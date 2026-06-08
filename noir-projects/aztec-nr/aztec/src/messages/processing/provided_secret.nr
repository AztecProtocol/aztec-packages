use crate::protocol::traits::{Deserialize, Serialize};

/// A tagging secret the app supplies explicitly to `get_pending_tagged_logs`.
///
/// These are searched alongside the secrets PXE derives or stores internally, and exist for secrets PXE cannot
/// enumerate on its own (e.g. handshake-derived ones). `mode` is a delivery mode constant:
/// [`ONCHAIN_UNCONSTRAINED`](crate::messages::delivery::ONCHAIN_UNCONSTRAINED) or
/// [`ONCHAIN_CONSTRAINED`](crate::messages::delivery::ONCHAIN_CONSTRAINED).
#[derive(Deserialize, Serialize)]
pub(crate) struct ProvidedSecret {
    pub secret: Field,
    pub mode: Field,
}
